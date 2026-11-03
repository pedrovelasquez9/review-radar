import { expect, test } from 'claude-code/testing'

import { EMPTY_REPORT, analyzeBranch, recoverInterruptedReport, splitIntoParts } from '../core/analysis'
import { splitDiffByFile } from '../core/diff'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { createFakeEngine, fileDiff } from './fixtures'

const PRICE_DIFF = fileDiff('src/price.ts', 'const discount = 0.15')

// Three files of about 100 characters each.
const THREE_FILES_DIFF =
  fileDiff('src/a.ts', 'const a = 1') + fileDiff('src/b.ts', 'const b = 2') + fileDiff('src/c.ts', 'const c = 3')

test('changes that fit in one review skip the triage, however large', async () => {
  const engine = createFakeEngine({ diff: THREE_FILES_DIFF, reviewAnswer: '{"summary":"s","findings":[]}' })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(engine.modelRequests.map(request => request.model)).toEqual(['opus'])
})

test('changes over the budget are triaged in auto mode, then reviewed in parts', async () => {
  const engine = createFakeEngine({ diff: THREE_FILES_DIFF, reviewAnswer: '{"summary":"s","findings":[]}' })

  await analyzeBranch(engine, { ...DEFAULT_SETTINGS, reviewBudgetChars: 150 }, false)

  // The fake triage answers with no verdicts, so every file is still reviewed.
  expect(engine.modelRequests.map(request => request.model)).toEqual(['haiku', 'opus', 'opus', 'opus'])
  expect(String(engine.modelRequests[1]?.prompt).includes('This is part 1 of 3')).toBe(true)
  expect(String(engine.modelRequests[1]?.prompt).includes('reviewed in another part (do not report): src/b.ts, src/c.ts')).toBe(
    true,
  )
})

test('the thorough mode never triages', async () => {
  const engine = createFakeEngine({ diff: THREE_FILES_DIFF, reviewAnswer: '{"summary":"s","findings":[]}' })

  await analyzeBranch(engine, { ...DEFAULT_SETTINGS, reviewMode: 'thorough', reviewBudgetChars: 150 }, false)

  expect(engine.modelRequests.map(request => request.model)).toEqual(['opus', 'opus', 'opus'])
  expect(engine.progressSteps.includes('triage')).toBe(false)
})

test('files are grouped into parts that fit the budget, in diff order', async () => {
  const files = splitDiffByFile(THREE_FILES_DIFF)
  const fileNames = (budget: number) => splitIntoParts(files, budget).map(part => part.map(({ file }) => file))

  expect(fileNames(10_000)).toEqual([['src/a.ts', 'src/b.ts', 'src/c.ts']])
  expect(fileNames(150)).toEqual([['src/a.ts'], ['src/b.ts'], ['src/c.ts']])
  // A file over the budget is still a part of its own.
  expect(fileNames(10)).toEqual([['src/a.ts'], ['src/b.ts'], ['src/c.ts']])
})

const PRICE_REVIEW_ANSWER = JSON.stringify({
  summary: 'Changes pricing.',
  findings: [
    {
      severity: 'critical',
      category: 'business-logic',
      file: 'src/price.ts',
      line: 2,
      title: 'New discount',
      why: 'Check the rounding.',
    },
  ],
})

test('a critical finding gets its diff excerpt and a review key', async () => {
  const engine = createFakeEngine({ diff: PRICE_DIFF, reviewAnswer: PRICE_REVIEW_ANSWER })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  const report = engine.currentReport()
  const finding = report.findings[0]
  expect(report.status).toBe('ready')
  expect(report.baseBranch).toBe('origin/main')
  expect(finding?.title).toBe('New discount')
  expect(finding?.diffExcerpt?.includes('+const discount = 0.15')).toBe(true)
  expect(typeof finding?.reviewKey).toBe('string')
})

test('only files whose diff changed are sent to the model again', async () => {
  const engine = createFakeEngine({
    diff: PRICE_DIFF + fileDiff('src/cart.ts', 'const items = []'),
    reviewAnswer: PRICE_REVIEW_ANSWER,
  })
  await analyzeBranch(engine, DEFAULT_SETTINGS, false)
  expect(engine.modelRequests.length).toBe(1)

  // Only cart.ts changes: price.ts keeps its finding and is not sent again.
  engine.setDiff(PRICE_DIFF + fileDiff('src/cart.ts', 'const items = [1]'))
  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  const secondPrompt = String(engine.modelRequests[1]?.prompt ?? '')
  expect(secondPrompt.includes('+++ b/src/cart.ts')).toBe(true)
  expect(secondPrompt.includes('+++ b/src/price.ts')).toBe(false)
  expect(secondPrompt.includes('earlier finding: src/price.ts: New discount')).toBe(true)
  expect(engine.currentReport().findings.some(finding => finding.title === 'New discount')).toBe(true)
})

test('an unchanged diff is not analyzed twice', async () => {
  const engine = createFakeEngine({ diff: PRICE_DIFF, reviewAnswer: PRICE_REVIEW_ANSWER })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)
  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(engine.modelRequests.length).toBe(1)
})

test('a blocked review model falls back to sonnet, and the summary says so', async () => {
  const engine = createFakeEngine({ diff: PRICE_DIFF, reviewAnswer: PRICE_REVIEW_ANSWER, blockedModels: ['opus'] })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(engine.modelRequests.map(request => request.model)).toEqual(['opus', 'sonnet'])
  expect(engine.currentReport().summary.endsWith('(reviewed with sonnet: opus was unavailable)')).toBe(true)
})

test('the review is told what was asked and which files the agent edited', async () => {
  const engine = createFakeEngine({
    diff: PRICE_DIFF + fileDiff('src/cart.ts', 'const items = []') + fileDiff('README.md', 'New intro'),
    reviewAnswer: PRICE_REVIEW_ANSWER,
    sessionIntent: {
      requests: ['Add a 15% discount\nto prices', 'Keep the cart untouched'],
      editedFiles: ['C:\\work\\shop\\src\\price.ts', 'C:\\work\\shop\\README.md'],
    },
  })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  const prompt = String(engine.modelRequests[0]?.prompt ?? '')
  expect(prompt.includes('1. Add a 15% discount to prices')).toBe(true)
  expect(prompt.includes('2. Keep the cart untouched')).toBe(true)
  expect(prompt.includes('Files the agent edited in this session: src/price.ts, README.md')).toBe(true)
})

test('without recorded requests, nothing is judged as unrequested', async () => {
  const engine = createFakeEngine({
    diff: PRICE_DIFF,
    reviewAnswer: PRICE_REVIEW_ANSWER,
    sessionIntent: { requests: [], editedFiles: ['C:\\work\\shop\\src\\price.ts'] },
  })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(String(engine.modelRequests[0]?.prompt ?? '').includes('What the developer asked for')).toBe(false)
})

test('an empty diff reports no changes without calling a model', async () => {
  const engine = createFakeEngine({ diff: '', reviewAnswer: PRICE_REVIEW_ANSWER })

  await analyzeBranch(engine, { ...DEFAULT_SETTINGS, language: 'es' }, false)

  expect(engine.currentReport().summary).toBe('Sin cambios respecto a la base.')
  expect(engine.modelRequests.length).toBe(0)
})

test('an analysis announces each step it goes through, then clears it', async () => {
  const engine = createFakeEngine({ diff: PRICE_DIFF, reviewAnswer: PRICE_REVIEW_ANSWER })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(engine.progressSteps).toEqual(['reading-changes', 'deep-review'])
  expect(engine.currentReport().progress).toBe(undefined)
})

test('a report left analyzing by an interrupted run goes back to what it showed', async () => {
  const interrupted = { ...EMPTY_REPORT, status: 'analyzing' as const, progress: { step: 'reading-changes' as const } }

  expect(recoverInterruptedReport(interrupted).status).toBe('idle')
  expect(recoverInterruptedReport({ ...interrupted, analyzedAt: 5 }).status).toBe('ready')
  expect(recoverInterruptedReport({ ...interrupted, analyzedAt: 5 }).progress).toBe(undefined)
  expect(recoverInterruptedReport({ ...EMPTY_REPORT, status: 'error' }).status).toBe('error')
})

test('an analysis the person asked for shows the loader before anything else runs', async () => {
  const engine = createFakeEngine({ diff: PRICE_DIFF, reviewAnswer: PRICE_REVIEW_ANSWER })
  const firstGitCommand: { statusThen?: string } = {}
  const runCommand = engine.runCommand
  engine.runCommand = async (argv, timeoutMs) => {
    firstGitCommand.statusThen ??= engine.currentReport().status
    return runCommand(argv, timeoutMs)
  }

  await analyzeBranch(engine, DEFAULT_SETTINGS, true)

  expect(firstGitCommand.statusThen).toBe('analyzing')
})

test('an automatic analysis of an unchanged diff never shows the loader', async () => {
  const engine = createFakeEngine({ diff: PRICE_DIFF, reviewAnswer: PRICE_REVIEW_ANSWER })
  await analyzeBranch(engine, DEFAULT_SETTINGS, false)
  engine.progressSteps.length = 0

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(engine.progressSteps).toEqual([])
})

test('the pane is revealed only when there are changes to review', async () => {
  const engine = createFakeEngine({ diff: '', reviewAnswer: PRICE_REVIEW_ANSWER })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)
  expect(engine.revealPaneCount()).toBe(0)

  engine.setDiff(PRICE_DIFF)
  await analyzeBranch(engine, DEFAULT_SETTINGS, false)
  expect(engine.revealPaneCount()).toBe(1)

  // Same diff again: nothing new, so no second reveal.
  await analyzeBranch(engine, DEFAULT_SETTINGS, false)
  expect(engine.revealPaneCount()).toBe(1)
})
