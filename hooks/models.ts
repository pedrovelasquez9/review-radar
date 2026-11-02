// Calls to the models, through the session's own Claude client.

import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'

import type { ReviewModelAnswer } from '../core/engine'
import type { ReviewModel } from './settings'

type CompleteWithModel = (request: ModelCompleteRequest) => Promise<ModelCompleteResult>

const TRIAGE_MODEL = 'haiku'
// Used when the configured review model cannot answer.
const FALLBACK_REVIEW_MODEL: ReviewModel = 'sonnet'

// The triage answer, or undefined when the call fails in any way: a failed
// triage simply clears no file.
export async function askTriageModel(
  completeWithModel: CompleteWithModel,
  systemPrompt: string,
  prompt: string,
): Promise<string | undefined> {
  const reply = await completeWithModel({
    model: TRIAGE_MODEL,
    system: systemPrompt,
    prompt,
    effort: 'low',
    maxTokens: 4000,
    timeoutMs: 60_000,
  }).catch(() => undefined)

  return reply?.isAnswered ? reply.text : undefined
}

// Asks the preferred model and, when it cannot answer (no access, a model the
// organization blocks, an API error), the fallback model. An interrupted call
// is not retried. Throws when no model answered.
export async function askReviewModel(
  completeWithModel: CompleteWithModel,
  preferredModel: ReviewModel,
  systemPrompt: string,
  prompt: string,
): Promise<ReviewModelAnswer> {
  const modelsToTry = preferredModel === FALLBACK_REVIEW_MODEL ? [preferredModel] : [preferredModel, FALLBACK_REVIEW_MODEL]
  let lastFailure = 'no model answered'

  for (const model of modelsToTry) {
    try {
      const reply = await completeWithModel({
        model,
        // The system prompt is the same on every call: cached, it is billed once.
        system: [{ text: systemPrompt, cache: true }],
        prompt,
        effort: 'high',
        maxTokens: 8000,
        timeoutMs: 300_000,
      })
      if (reply.isAnswered) return { text: reply.text, answeredBy: model }

      lastFailure = reply.reason
      if (reply.reason === 'aborted') break
    } catch (error) {
      // The engine refused to send the request, e.g. a model the organization blocks.
      lastFailure = String(error)
    }
  }

  throw new Error(`model: ${lastFailure}`)
}
