import { expect, test } from 'claude-code/testing'

import { analyzeBranch } from '../hooks/analysis'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { createFakeEngine, fileDiff } from './fixtures'

const PRICE_DIFF = fileDiff('src/price.ts', 'const discount = 0.15')

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

test('an empty diff reports no changes without calling a model', async () => {
  const engine = createFakeEngine({ diff: '', reviewAnswer: PRICE_REVIEW_ANSWER })

  await analyzeBranch(engine, { ...DEFAULT_SETTINGS, language: 'es' }, false)

  expect(engine.currentReport().summary).toBe('Sin cambios respecto a la base.')
  expect(engine.modelRequests.length).toBe(0)
})
