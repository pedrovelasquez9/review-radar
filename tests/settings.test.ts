import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, readSettings } from '../hooks/settings'

test('missing or unknown options fall back to the defaults', async () => {
  expect(readSettings({})).toEqual(DEFAULT_SETTINGS)
  expect(readSettings({ language: 'fr', reviewModel: 'gpt' })).toEqual(DEFAULT_SETTINGS)
})

test('chosen options are read', async () => {
  expect(readSettings({ language: 'es', reviewModel: 'sonnet', autoAnalyze: false })).toEqual({
    language: 'es',
    reviewModel: 'sonnet',
    isAutoAnalysisOn: false,
  })
})
