import type { Language } from './messages'

// What the person chose, as each platform reads it from its own configuration.
export type Settings = {
  language: Language
  // The review model's name as the person knows it: shown in the loader and in
  // the note when another model had to answer.
  reviewModel: string
  isAutoAnalysisOn: boolean
}
