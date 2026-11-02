// The analysis pipeline: read the branch diff, triage it when large, review
// the files that need it in depth, and store the report the pane draws.

import type { AnalysisProgress, Finding, Report } from '../types'
import { excerptForFinding, findHunkContainingLine, hashText, separateLockfiles, splitDiffByFile } from './diff'
import type { FileDiff } from './diff'
import type { Engine } from './engine'
import { findBaseBranch, findRepositoryRoot, isInsideGitRepository, readBranchDiff } from './git'
import { hasIntent, toRepositoryPaths } from './intent'
import type { SessionIntent } from './intent'
import { messagesFor } from './messages'
import type { Messages } from './messages'
import { buildReviewPrompt, parseReviewAnswer, reviewSystemPrompt } from './review'
import { findLiteralSecrets, mergeSecretFindings } from './secrets'
import type { Settings } from './settings'
import { buildTriagePrompt, mustAlwaysInspect, parseTriageAnswer, triageSystemPrompt } from './triage'

// Below this many changed characters a triage saves little and risks a miss:
// every changed file goes straight to the deep review.
const MIN_CHARS_FOR_TRIAGE = 30_000
const MAX_TRIAGE_PROMPT_CHARS = 80_000
const MAX_REVIEW_DIFF_CHARS = 150_000

// The report before any analysis has run.
export const EMPTY_REPORT: Report = {
  status: 'idle',
  summary: '',
  findings: [],
  baseBranch: '',
  diffHash: '',
  fileDiffHashes: {},
  language: 'en',
  analyzedAt: 0,
}

// A report left 'analyzing' by an analysis that never finished (the mod was
// reloaded or the session restarted mid-run) goes back to what it showed
// before, so the pane does not keep a loader nothing is behind.
export function recoverInterruptedReport(report: Report): Report {
  if (report.status !== 'analyzing') return report
  const hasPreviousResults = report.analyzedAt > 0
  return { ...report, status: hasPreviousResults ? 'ready' : 'idle', progress: undefined }
}

// One analysis at a time: each queued call runs after the previous one ends.
// A queued run on a diff that did not change stops early, at the hash check.
let analysisQueue: Promise<void> = Promise.resolve()

export function queueAnalysis(engine: Engine, settings: Settings, isForced = false): Promise<void> {
  analysisQueue = analysisQueue.then(() => analyzeBranch(engine, settings, isForced))
  return analysisQueue
}

// A forced analysis reviews every file again; otherwise files whose diff did not
// change since the last analysis keep their findings.
export async function analyzeBranch(engine: Engine, settings: Settings, isForced: boolean): Promise<void> {
  const messages = messagesFor(settings.language)
  try {
    await runAnalysis(engine, settings, messages, isForced)
  } catch (error) {
    await engine.updateReport((report): Report => ({
      ...report,
      status: 'error',
      progress: undefined,
      errorMessage: String(error),
    }))
  } finally {
    engine.showStatus(undefined)
  }
}

async function runAnalysis(
  engine: Engine,
  settings: Settings,
  messages: Messages,
  isForced: boolean,
): Promise<void> {
  // An analysis the person asked for clears the pane to the loader at once.
  // Automatic ones wait until the diff turns out to have changed, so an
  // unchanged diff never flashes the loader.
  if (isForced) await showAnalyzing(engine)

  if (!(await isInsideGitRepository(engine))) {
    await engine.updateReport((report): Report => ({ ...report, status: 'no-repo' }))
    return
  }

  const baseBranch = await findBaseBranch(engine)
  const fullDiff = await readBranchDiff(engine, baseBranch)
  const diffHash = await hashText(fullDiff)
  const previousReport = await engine.readReport()

  // A report written in another language is redone whole.
  const isSameLanguage = previousReport.language === settings.language
  const isUpToDate = isSameLanguage && previousReport.status === 'ready' && previousReport.diffHash === diffHash
  if (isUpToDate && !isForced) return

  if (fullDiff.trim() === '') {
    await engine.updateReport((): Report => ({
      ...EMPTY_REPORT,
      status: 'ready',
      summary: messages.noChangesSummary,
      baseBranch,
      diffHash,
      language: settings.language,
    }))
    return
  }

  // From here on the pane shows its loader, step by step.
  await showAnalyzing(engine, baseBranch)
  engine.revealPane()
  engine.showStatus(messages.statusLineAnalyzing)

  const { diffWithoutLockfiles, lockfiles } = separateLockfiles(fullDiff)
  const files = splitDiffByFile(diffWithoutLockfiles)
  const fileDiffHashes = await hashEachFile(files)

  const canReuseEarlierFindings = !isForced && isSameLanguage
  const { changedFiles, unchangedFiles, reusedFindings } = canReuseEarlierFindings
    ? splitByEarlierAnalysis(files, fileDiffHashes, previousReport)
    : { changedFiles: files, unchangedFiles: [], reusedFindings: [] }

  const secretFindings = findLiteralSecrets(fullDiff, messages).filter(
    finding => !unchangedFiles.includes(finding.file),
  )
  const sessionIntent = await loadSessionIntent(engine)

  // Files holding a secret, and files the agent edited in this session (to check
  // them against the requests), always get the deep review.
  const filesToAlwaysReview = new Set([
    ...secretFindings.map(({ file }) => file),
    ...(sessionIntent?.editedFiles ?? []),
  ])
  const { filesToReview, routineFindings } = await triageChangedFiles(
    engine,
    changedFiles,
    filesToAlwaysReview,
    messages,
  )

  const deepReview = await reviewInDepth(engine, settings, messages, {
    filesToReview,
    routineFindings,
    unchangedFiles,
    reusedFindings,
    lockfiles,
    sessionIntent,
    previousSummary: previousReport.summary,
  })

  const diffByFile = new Map(splitDiffByFile(fullDiff).map(({ file, diffText }) => [file, diffText]))
  const newFindings = await attachDiffExcerpts(mergeSecretFindings(deepReview.findings, secretFindings), diffByFile)
  const findings = [...newFindings, ...reusedFindings, ...routineFindings]

  await engine.updateReport((): Report => ({
    status: 'ready',
    summary: deepReview.summary,
    findings,
    baseBranch,
    diffHash,
    fileDiffHashes,
    language: settings.language,
    analyzedAt: Date.now(),
  }))

  const criticalCount = findings.filter(finding => finding.severity === 'critical').length
  if (criticalCount > 0) engine.showToast(messages.needsReviewToast(criticalCount))
}

// The session's requests and the files the agent edited, with paths as the diff
// names them; undefined when there is nothing to judge "unrequested" against.
async function loadSessionIntent(engine: Engine): Promise<SessionIntent | undefined> {
  const recorded = await engine.readSessionIntent()
  const repositoryRoot = await findRepositoryRoot(engine)
  if (repositoryRoot === undefined) return undefined

  const intent: SessionIntent = {
    requests: recorded.requests,
    editedFiles: toRepositoryPaths(recorded.editedFiles, repositoryRoot),
  }
  return hasIntent(intent) ? intent : undefined
}

// Switches the pane to its loader, at the first step. The base branch is kept
// as it was when it is not known yet.
async function showAnalyzing(engine: Engine, baseBranch?: string): Promise<void> {
  await engine.updateReport((report): Report => ({
    ...report,
    status: 'analyzing',
    baseBranch: baseBranch ?? report.baseBranch,
    progress: { step: 'reading-changes' },
  }))
}

// Moves the pane's loader to the next step.
async function showProgress(engine: Engine, progress: AnalysisProgress): Promise<void> {
  await engine.updateReport((report): Report => ({ ...report, progress }))
}

async function hashEachFile(files: FileDiff[]): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}
  for (const { file, diffText } of files) hashes[file] = await hashText(diffText)
  return hashes
}

// Files whose diff is what the last analysis saw keep that analysis's findings
// and are not sent to the models again.
// Known limit: the kept files' cross-file context comes from that earlier
// analysis; the review prompt lists their findings so the model still sees them.
function splitByEarlierAnalysis(
  files: FileDiff[],
  fileDiffHashes: Record<string, string>,
  previousReport: Report,
): { changedFiles: FileDiff[]; unchangedFiles: string[]; reusedFindings: Finding[] } {
  const isUnchanged = (file: string) => previousReport.fileDiffHashes[file] === fileDiffHashes[file]

  const changedFiles = files.filter(({ file }) => !isUnchanged(file))
  const unchangedFiles = files.filter(({ file }) => isUnchanged(file)).map(({ file }) => file)
  const reusedFindings = previousReport.findings.filter(
    finding => fileDiffHashes[finding.file] !== undefined && isUnchanged(finding.file),
  )
  return { changedFiles, unchangedFiles, reusedFindings }
}

// Which changed files get the deep review. Small diffs skip the triage: every
// file is reviewed. Data/config files and `filesToAlwaysReview` are never cleared.
async function triageChangedFiles(
  engine: Engine,
  changedFiles: FileDiff[],
  filesToAlwaysReview: ReadonlySet<string>,
  messages: Messages,
): Promise<{ filesToReview: FileDiff[]; routineFindings: Finding[] }> {
  const changedChars = changedFiles.reduce((total, { diffText }) => total + diffText.length, 0)
  const filesToInspect = new Set(changedFiles.map(({ file }) => file))
  let titlesByFile = new Map<string, string>()

  if (changedChars >= MIN_CHARS_FOR_TRIAGE) {
    await showProgress(engine, { step: 'triage', fileCount: changedFiles.length })
    const triageAnswer = await engine.askTriageModel(
      triageSystemPrompt(messages.languageNameForModel),
      buildTriagePrompt(changedFiles).slice(0, MAX_TRIAGE_PROMPT_CHARS),
    )
    const triage = parseTriageAnswer(triageAnswer ?? '', changedFiles)
    titlesByFile = triage.titlesByFile

    for (const { file } of changedFiles) {
      const mustReview = mustAlwaysInspect(file) || filesToAlwaysReview.has(file)
      const isClearedByTriage = !triage.filesToInspect.has(file) && !mustReview
      if (isClearedByTriage) filesToInspect.delete(file)
    }
  }

  const filesToReview = changedFiles.filter(({ file }) => filesToInspect.has(file))
  const routineFindings = changedFiles
    .filter(({ file }) => !filesToInspect.has(file))
    .map(({ file }): Finding => ({
      severity: 'pr',
      category: 'routine',
      file,
      title: titlesByFile.get(file) ?? messages.routineChangeTitle,
      why: '',
    }))

  return { filesToReview, routineFindings }
}

type DeepReviewInput = {
  filesToReview: FileDiff[]
  routineFindings: Finding[]
  unchangedFiles: string[]
  reusedFindings: Finding[]
  lockfiles: string[]
  sessionIntent: SessionIntent | undefined
  previousSummary: string
}

// The review model reads the files that need it and writes the summary and the
// findings. With nothing to review, the summary is kept or says all is routine.
async function reviewInDepth(
  engine: Engine,
  settings: Settings,
  messages: Messages,
  input: DeepReviewInput,
): Promise<{ summary: string; findings: Finding[] }> {
  if (input.filesToReview.length === 0) {
    const summary = input.reusedFindings.length > 0 ? input.previousSummary : messages.onlyRoutineSummary
    return { summary, findings: [] }
  }

  engine.showStatus(messages.statusLineDeepReview(input.filesToReview.length))
  await showProgress(engine, {
    step: 'deep-review',
    fileCount: input.filesToReview.length,
    model: settings.reviewModel,
  })
  const { prompt, isTruncated } = buildReviewPrompt({
    diff: input.filesToReview.map(({ diffText }) => diffText).join(''),
    lockfiles: input.lockfiles,
    routineFiles: input.routineFindings.map(({ file }) => file),
    unchangedFiles: input.unchangedFiles,
    earlierCriticalFindings: input.reusedFindings.filter(finding => finding.severity === 'critical'),
    sessionIntent: input.sessionIntent,
    maxDiffChars: MAX_REVIEW_DIFF_CHARS,
  })

  const answer = await engine.askReviewModel(reviewSystemPrompt(messages.languageNameForModel), prompt)
  const { summary, findings } = parseReviewAnswer(answer.text)

  const truncatedNote = isTruncated ? messages.truncatedDiffNote : ''
  const fallbackNote =
    answer.answeredBy === settings.reviewModel ? '' : messages.fallbackModelNote(settings.reviewModel, answer.answeredBy)
  return { summary: summary + truncatedNote + fallbackNote, findings }
}

// Each critical finding gets the diff excerpt the pane draws under it, and the
// review key its "reviewed" mark is stored under. A line the model gave outside
// the diff is dropped, so the excerpt falls back to the whole file's hunks.
async function attachDiffExcerpts(findings: Finding[], diffByFile: Map<string, string>): Promise<Finding[]> {
  const withExcerpts: Finding[] = []

  for (const finding of findings) {
    const fileDiffText = diffByFile.get(finding.file)
    if (finding.severity !== 'critical' || fileDiffText === undefined) {
      withExcerpts.push(finding)
      continue
    }

    const isLineInDiff = finding.line !== undefined && findHunkContainingLine(fileDiffText, finding.line) !== undefined
    const line = isLineInDiff ? finding.line : undefined
    const diffExcerpt = excerptForFinding(fileDiffText, line)
    const reviewKey = await hashText(`${finding.file}\n${diffExcerpt}`)
    withExcerpts.push({ ...finding, line, diffExcerpt, reviewKey })
  }

  return withExcerpts
}
