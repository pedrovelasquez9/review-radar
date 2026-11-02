import type { PluginOptions } from 'claude-code'

import type { Settings } from '../core/settings'

// What the person chose in the plugin's userConfig (see .claude-plugin/plugin.json).
export type ClaudeSettings = Settings & { reviewModel: ReviewModel }

export type ReviewModel = 'opus' | 'sonnet' | 'haiku'

const REVIEW_MODELS: readonly ReviewModel[] = ['opus', 'sonnet', 'haiku']

export const DEFAULT_SETTINGS: ClaudeSettings = {
  language: 'en',
  reviewModel: 'opus',
  isAutoAnalysisOn: true,
}

// A missing or unknown value falls back to its default.
export function readSettings(options: PluginOptions): ClaudeSettings {
  const reviewModel = REVIEW_MODELS.find(model => model === options.reviewModel)

  return {
    language: options.language === 'es' ? 'es' : DEFAULT_SETTINGS.language,
    reviewModel: reviewModel ?? DEFAULT_SETTINGS.reviewModel,
    isAutoAnalysisOn: options.autoAnalyze !== false,
  }
}
