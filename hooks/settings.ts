import type { PluginOptions } from 'claude-code'

import type { Language } from './messages'

// What the person chose in the plugin's userConfig (see .claude-plugin/plugin.json).
export type Settings = {
  language: Language
  reviewModel: ReviewModel
  isAutoAnalysisOn: boolean
}

export type ReviewModel = 'opus' | 'sonnet' | 'haiku'

const REVIEW_MODELS: readonly ReviewModel[] = ['opus', 'sonnet', 'haiku']

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  reviewModel: 'opus',
  isAutoAnalysisOn: true,
}

// A missing or unknown value falls back to its default.
export function readSettings(options: PluginOptions): Settings {
  const reviewModel = REVIEW_MODELS.find(model => model === options.reviewModel)

  return {
    language: options.language === 'es' ? 'es' : DEFAULT_SETTINGS.language,
    reviewModel: reviewModel ?? DEFAULT_SETTINGS.reviewModel,
    isAutoAnalysisOn: options.autoAnalyze !== false,
  }
}
