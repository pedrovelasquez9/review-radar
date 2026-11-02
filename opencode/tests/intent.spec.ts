import { expect, test } from 'bun:test'

import { readIntentFromSession } from '../src/intent'
import type { MessagePart, SessionMessage } from '../src/intent'
import { parseModelRef, readSettings } from '../src/settings'

test('requests are what the person typed; edited files come from finished edit tools', () => {
  const messages: SessionMessage[] = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant' },
  ]
  const parts: Record<string, MessagePart[]> = {
    u1: [
      { type: 'text', text: 'Add a 10% discount' },
      { type: 'text', text: 'contents of a file OpenCode attached', synthetic: true },
      { type: 'text', text: '/review-radar' },
    ],
    a1: [
      { type: 'tool', tool: 'edit', state: { status: 'completed', input: { filePath: 'C:/work/shop/src/pricing.ts' } } },
      { type: 'tool', tool: 'write', state: { status: 'error', input: { filePath: 'C:/work/shop/failed.ts' } } },
      {
        type: 'tool',
        tool: 'apply_patch',
        state: {
          status: 'completed',
          input: { patchText: '*** Begin Patch\n*** Update File: package.json\n@@\n*** Add File: src/new.ts\n*** End Patch' },
        },
      },
    ],
  }

  const intent = readIntentFromSession(messages, id => parts[id] ?? [])

  expect(intent.requests).toEqual(['Add a 10% discount'])
  expect(intent.editedFiles).toEqual(['C:/work/shop/src/pricing.ts', 'package.json', 'src/new.ts'])
})

test('options fall back to their defaults; a model is "provider/model"', () => {
  expect(readSettings(undefined)).toMatchObject({ language: 'en', isAutoAnalysisOn: true, reviewModelRef: undefined })
  expect(readSettings({ language: 'es', autoAnalyze: false, model: 'anthropic/claude-opus-5-5' })).toMatchObject({
    language: 'es',
    isAutoAnalysisOn: false,
    reviewModel: 'anthropic/claude-opus-5-5',
  })
  expect(parseModelRef('openrouter/meta/llama-4')).toEqual({ providerID: 'openrouter', modelID: 'meta/llama-4' })
  expect(parseModelRef('no-slash')).toBeUndefined()
})
