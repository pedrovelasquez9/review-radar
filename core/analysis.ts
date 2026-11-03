// The analysis pipeline: read the branch diff, triage it when it does not fit
// in one deep review, review the files that need it in depth (in parts when
// they do not fit in one call), and store the report the pane draws.

import type { AnalysisProgress, Finding, Report } from '../types'
import { excerptForFinding, findHunkContainingLine, hashText, separateLockfiles, splitDiffByFile } from './diff'
import type { FileDiff } from './diff'
import type { Engine } from './engine'
import { hasLogicChange } from './logic-change'
import { findBaseBranch, findRepositoryRoot, isInsideGitRepository, readBranchDiff, readWiderBranchDiff } from './git'
import { hasIntent, toRepositoryPaths } from './intent'
import type { SessionIntent } from './intent'
import { messagesFor } from './messages'
import type { Messages } from './messages'
import { buildReviewPrompt, parseReviewAnswer, reviewSystemPrompt } from './review'
import { findLiteralSecrets, mergeSecretFindings } from './secrets'
import type { Settings } from './settings'
import { buildTriagePrompt, mustAlwaysInspect, parseTriageAnswer, triageSystemPrompt } from './triage'

const MAX_TRIAGE_PROMPT_CHARS = 80_000
// A deep review longer than this many calls is cut: the files left over go to
// the PR list as not reviewed, and the summary says the diff was truncated.
const MAX_REVIEW_PARTS = 6

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
    settings,
    changedFiles,
    filesToAlwaysReview,
    messages,
  )

  const deepReview = await reviewInDepth(engine, settings, messages, {
    filesToReview: await widenContext(engine, settings, baseBranch, filesToReview),
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

// Which changed files get the deep review. Changes that fit in one review call
// skip the triage, and so does the thorough mode: every file is reviewed, so
// none can be cleared by mistake. Data/config files, files with a logic change
// and `filesToAlwaysReview` are never cleared, so the triage is not even shown them.
async function triageChangedFiles(
  engine: Engine,
  settings: Settings,
  changedFiles: FileDiff[],
  filesToAlwaysReview: ReadonlySet<string>,
  messages: Messages,
): Promise<{ filesToReview: FileDiff[]; routineFindings: Finding[] }> {
  const changedChars = changedFiles.reduce((total, { diffText }) => total + diffText.length, 0)
  const filesToInspect = new Set(changedFiles.map(({ file }) => file))
  let titlesByFile = new Map<string, string>()

  const needsTriage = settings.reviewMode === 'auto' && changedChars > settings.reviewBudgetChars
  const clearableFiles = needsTriage
    ? changedFiles.filter(
        fileDiff => !mustAlwaysInspect(fileDiff.file) && !filesToAlwaysReview.has(fileDiff.file) && !hasLogicChange(fileDiff),
      )
    : []
  if (clearableFiles.length > 0) {
    await showProgress(engine, { step: 'triage', fileCount: clearableFiles.length })
    const triageAnswer = await engine.askTriageModel(
      triageSystemPrompt(messages.languageNameForModel),
      buildTriagePrompt(clearableFiles).slice(0, Math.min(MAX_TRIAGE_PROMPT_CHARS, settings.reviewBudgetChars)),
    )
    const triage = parseTriageAnswer(triageAnswer ?? '', clearableFiles)
    titlesByFile = triage.titlesByFile

    for (const { file } of clearableFiles) {
      if (!triage.filesToInspect.has(file)) filesToInspect.delete(file)
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

// The files to review with as much surrounding code as fits without one more
// review call: the whole enclosing function, else 10 lines around each change,
// else the plain diff. A file whose wider diff alone is over the budget keeps its
// plain diff. Only the review reads the wider diffs: hashes, the secret scan and
// the excerpts under findings use the plain one.
async function widenContext(
  engine: Engine,
  settings: Settings,
  baseBranch: string,
  files: FileDiff[],
): Promise<FileDiff[]> {
  if (files.length === 0) return files
  const partCount = splitIntoParts(files, settings.reviewBudgetChars).length

  for (const context of ['function', 'ten-lines'] as const) {
    const widerDiff = await readWiderBranchDiff(engine, baseBranch, context)
    const widerByFile = new Map(splitDiffByFile(widerDiff).map(wider => [wider.file, wider.diffText]))
    const widened = files.map((file): FileDiff => {
      const widerText = widerByFile.get(file.file)
      const fits = widerText !== undefined && widerText.length <= settings.reviewBudgetChars
      // The last file of a diff has no closing newline (git output is trimmed).
      return fits ? { file: file.file, diffText: widerText.endsWith('\n') ? widerText : `${widerText}\n` } : file
    })
    if (splitIntoParts(widened, settings.reviewBudgetChars).length <= partCount) return widened
  }
  return files
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
// findings, in as many parts as the review budget needs. With nothing to review,
// the summary is kept or says all is routine.
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

  const allParts = splitIntoParts(input.filesToReview, settings.reviewBudgetChars)
  const parts = allParts.slice(0, MAX_REVIEW_PARTS)
  const leftOverFiles = allParts.slice(MAX_REVIEW_PARTS).flat()
  engine.showStatus(messages.statusLineDeepReview(input.filesToReview.length))

  const summaries: string[] = []
  const findings: Finding[] = []
  let isTruncated = leftOverFiles.length > 0
  let answeredBy = settings.reviewModel

  for (const [index, partFiles] of parts.entries()) {
    const part = parts.length > 1 ? { index: index + 1, count: parts.length } : undefined
    await showProgress(engine, {
      step: 'deep-review',
      fileCount: input.filesToReview.length,
      model: settings.reviewModel,
      ...(part && { part: part.index, partCount: part.count }),
    })
    const review = buildReviewPrompt({
      diff: partFiles.map(({ diffText }) => diffText).join(''),
      lockfiles: input.lockfiles,
      routineFiles: input.routineFindings.map(({ file }) => file),
      otherPartFiles: input.filesToReview.filter(file => !partFiles.includes(file)).map(({ file }) => file),
      part,
      unchangedFiles: input.unchangedFiles,
      earlierCriticalFindings: input.reusedFindings.filter(finding => finding.severity === 'critical'),
      sessionIntent: input.sessionIntent,
      maxDiffChars: settings.reviewBudgetChars,
    })

    const answer = await engine.askReviewModel(reviewSystemPrompt(messages.languageNameForModel), review.prompt)
    const parsed = parseReviewAnswer(answer.text)
    summaries.push(parsed.summary)
    findings.push(...parsed.findings)
    isTruncated ||= review.isTruncated
    if (answer.answeredBy !== settings.reviewModel) answeredBy = answer.answeredBy
  }

  // ponytail: the first part's summary stands for the branch (every part is told
  // the whole file list); a summary of summaries would cost one more call.
  const summary = summaries.find(text => text !== '') ?? ''
  const truncatedNote = isTruncated ? messages.truncatedDiffNote : ''
  const fallbackNote =
    answeredBy === settings.reviewModel ? '' : messages.fallbackModelNote(settings.reviewModel, answeredBy)
  const notReviewedFindings = leftOverFiles.map(
    ({ file }): Finding => ({ severity: 'pr', category: 'routine', file, title: messages.notReviewedTitle, why: '' }),
  )
  return { summary: summary + truncatedNote + fallbackNote, findings: [...findings, ...notReviewedFindings] }
}

// Files grouped, in diff order, into parts of at most `budgetChars` characters.
// A file longer than the budget is a part of its own, cut when it is reviewed.
export function splitIntoParts(files: FileDiff[], budgetChars: number): FileDiff[][] {
  const parts: FileDiff[][] = []
  let current: FileDiff[] = []
  let currentChars = 0

  for (const file of files) {
    const fits = currentChars + file.diffText.length <= budgetChars
    if (!fits && current.length > 0) {
      parts.push(current)
      current = []
      currentChars = 0
    }
    current.push(file)
    currentChars += file.diffText.length
  }
  if (current.length > 0) parts.push(current)
  return parts
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
