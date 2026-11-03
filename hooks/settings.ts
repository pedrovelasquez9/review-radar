import type { PluginOptions } from 'claude-code'

import { MAX_REVIEW_BUDGET_CHARS, parseReviewMode } from '../core/settings'
import type { Settings } from '../core/settings'

// What the person chose in the plugin's userConfig (see .claude-plugin/plugin.json).
export type ClaudeSettings = Settings & { reviewModel: ReviewModel }

export type ReviewModel = 'opus' | 'sonnet' | 'haiku'

const REVIEW_MODELS: readonly ReviewModel[] = ['opus', 'sonnet', 'haiku']

// Every model has a large context window; the smallest one reads long diffs less
// carefully, so it gets shorter parts.
const REVIEW_BUDGET_CHARS: Record<ReviewModel, number> = {
  opus: MAX_REVIEW_BUDGET_CHARS,
  sonnet: MAX_REVIEW_BUDGET_CHARS,
  haiku: 100_000,
}

export const DEFAULT_SETTINGS: ClaudeSettings = {
  language: 'en',
  reviewModel: 'opus',
  isAutoAnalysisOn: true,
  reviewMode: 'auto',
  reviewBudgetChars: REVIEW_BUDGET_CHARS.opus,
}

// A missing or unknown value falls back to its default.
export function readSettings(options: PluginOptions): ClaudeSettings {
  const reviewModel = REVIEW_MODELS.find(model => model === options.reviewModel) ?? DEFAULT_SETTINGS.reviewModel

  return {
    language: options.language === 'es' ? 'es' : DEFAULT_SETTINGS.language,
    reviewModel,
    isAutoAnalysisOn: options.autoAnalyze !== false,
    reviewMode: parseReviewMode(options.reviewMode),
    reviewBudgetChars: REVIEW_BUDGET_CHARS[reviewModel],
  }
}
