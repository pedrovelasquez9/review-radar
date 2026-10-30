import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { hasIntent, readIntentFromTranscript, toRepositoryPaths } from '../hooks/intent'

function userMessage(text: string): SessionMessage {
  return { role: 'user', text, toolUses: [] }
}

function toolResultMessage(): SessionMessage {
  return { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'ok', isError: false }] }
}

function assistantEditing(...uses: { tool: string; input: Record<string, unknown>; isError?: true }[]): SessionMessage {
  return {
    role: 'assistant',
    text: '',
    toolUses: uses.map((use, index) => ({ tool_use_id: `u${index}`, ...use })),
  }
}

test('requests are what the person wrote, not commands, tool results or engine notes', async () => {
  const intent = readIntentFromTranscript([
    userMessage('  Fix the discount rounding  '),
    userMessage('/review-radar'),
    userMessage('<task-notification>build finished</task-notification>'),
    toolResultMessage(),
    userMessage('Also keep two decimals'),
  ])

  expect(intent.requests).toEqual(['Fix the discount rounding', 'Also keep two decimals'])
})

test('edited files come from the editing tools that succeeded, once each', async () => {
  const intent = readIntentFromTranscript([
    assistantEditing(
      { tool: 'Edit', input: { file_path: 'C:\\shop\\src\\price.ts' } },
      { tool: 'Write', input: { file_path: 'C:\\shop\\src\\price.ts' } },
      { tool: 'NotebookEdit', input: { notebook_path: 'C:\\shop\\analysis.ipynb' } },
      { tool: 'Edit', input: { file_path: 'C:\\shop\\failed.ts' }, isError: true },
      { tool: 'Read', input: { file_path: 'C:\\shop\\README.md' } },
    ),
  ])

  expect(intent.editedFiles).toEqual(['C:\\shop\\src\\price.ts', 'C:\\shop\\analysis.ipynb'])
})

test('only the latest requests are kept, each cut to a readable length', async () => {
  const manyRequests = Array.from({ length: 40 }, (_, index) => userMessage(`request ${index + 1}`))
  const intent = readIntentFromTranscript(manyRequests)
  expect(intent.requests.length).toBe(30)
  expect(intent.requests[0]).toBe('request 11')

  const longRequest = readIntentFromTranscript([userMessage('x'.repeat(5_000))]).requests[0] ?? ''
  expect(longRequest.length).toBe(2_001)
})

test('edited paths become repository paths, whatever their spelling', async () => {
  const absolutePaths = [
    'C:\\work\\shop\\src\\price.ts',
    'c:/WORK/shop/README.md',
    '/c/work/shop/docs/api.md',
    'C:\\other\\notes.txt',
  ]

  expect(toRepositoryPaths(absolutePaths, 'C:/work/shop')).toEqual(['src/price.ts', 'README.md', 'docs/api.md'])
})

test('intent needs both a request and an edited file', async () => {
  expect(hasIntent({ requests: ['Fix it'], editedFiles: ['a.ts'] })).toBe(true)
  expect(hasIntent({ requests: [], editedFiles: ['a.ts'] })).toBe(false)
  expect(hasIntent({ requests: ['Fix it'], editedFiles: [] })).toBe(false)
})
