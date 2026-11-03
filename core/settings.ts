import type { Language } from './messages'

// 'auto' sorts files with the triage only when the changes do not fit in one
// deep review; 'thorough' never sorts: every changed file gets the deep review.
export type ReviewMode = 'auto' | 'thorough'

// What the person chose, as each platform reads it from its own configuration.
export type Settings = {
  language: Language
  // The review model's name as the person knows it: shown in the loader and in
  // the note when another model had to answer.
  reviewModel: string
  isAutoAnalysisOn: boolean
  reviewMode: ReviewMode
  // How many characters of diff the review model reads well in one call: past
  // it the review is split into parts (see core/analysis.ts).
  reviewBudgetChars: number
}

// What the largest models get: longer prompts cost more without reading better.
export const MAX_REVIEW_BUDGET_CHARS = 150_000
// Assumed for a model whose context window is not known: a small local model.
const UNKNOWN_CONTEXT_TOKENS = 32_000
const MIN_REVIEW_BUDGET_CHARS = 8_000

export function parseReviewMode(value: unknown): ReviewMode {
  return value === 'thorough' ? 'thorough' : 'auto'
}

// Half the context window goes to the diff (the rest to the instructions, the
// project context and the answer), at a conservative 3 characters per token.
export function reviewBudgetForContext(contextTokens: number | undefined): number {
  const tokens = contextTokens !== undefined && contextTokens > 0 ? contextTokens : UNKNOWN_CONTEXT_TOKENS
  return Math.max(MIN_REVIEW_BUDGET_CHARS, Math.min(MAX_REVIEW_BUDGET_CHARS, Math.floor(tokens * 0.5 * 3)))
}
