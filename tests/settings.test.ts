import { expect, test } from 'claude-code/testing'

import { MAX_REVIEW_BUDGET_CHARS, reviewBudgetForContext } from '../core/settings'
import { DEFAULT_SETTINGS, readSettings } from '../hooks/settings'

test('missing or unknown options fall back to the defaults', async () => {
  expect(readSettings({})).toEqual(DEFAULT_SETTINGS)
  expect(readSettings({ language: 'fr', reviewModel: 'gpt', reviewMode: 'fast' })).toEqual(DEFAULT_SETTINGS)
})

test('chosen options are read', async () => {
  expect(readSettings({ language: 'es', reviewModel: 'haiku', autoAnalyze: false, reviewMode: 'thorough' })).toEqual({
    language: 'es',
    reviewModel: 'haiku',
    isAutoAnalysisOn: false,
    reviewMode: 'thorough',
    reviewBudgetChars: 100_000,
  })
})

test('the review budget follows the model context window', async () => {
  expect(reviewBudgetForContext(1_000_000)).toBe(MAX_REVIEW_BUDGET_CHARS)
  expect(reviewBudgetForContext(16_000)).toBe(24_000)
  // Unknown: assumed to be a small local model.
  expect(reviewBudgetForContext(undefined)).toBe(48_000)
  expect(reviewBudgetForContext(0)).toBe(48_000)
})
