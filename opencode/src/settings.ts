// The plugin's options, as written in tui.json:
//   "plugin": [["opencode-review-radar", { "language": "es", "model": "anthropic/claude-opus-5-5" }]]

import type { Settings } from '../../core/settings'

// A model as OpenCode names it: provider and model id.
export type ModelRef = { providerID: string; modelID: string }

export type OpenCodeSettings = Settings & {
  // The review model; undefined uses the session's own model.
  reviewModelRef: ModelRef | undefined
  // The model that sorts large diffs; undefined uses the review model.
  triageModelRef: ModelRef | undefined
}

// A missing or unknown value falls back to its default.
export function readSettings(options: Record<string, unknown> | undefined): OpenCodeSettings {
  const reviewModelRef = parseModelRef(options?.model)

  return {
    language: options?.language === 'es' ? 'es' : 'en',
    // Replaced by the session's model when none is set (see tui.ts).
    reviewModel: reviewModelRef ? formatModelRef(reviewModelRef) : '',
    isAutoAnalysisOn: options?.autoAnalyze !== false,
    reviewModelRef,
    triageModelRef: parseModelRef(options?.triageModel),
  }
}

// "provider/model" (the model id may itself hold slashes); anything else is undefined.
export function parseModelRef(value: unknown): ModelRef | undefined {
  if (typeof value !== 'string') return undefined
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) return undefined
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) }
}

export function formatModelRef(model: ModelRef): string {
  return `${model.providerID}/${model.modelID}`
}
