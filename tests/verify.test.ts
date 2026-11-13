import { expect, test } from 'claude-code/testing'

import type { Finding } from '../types'
import type { Engine } from '../core/engine'
import { messagesFor } from '../core/messages'
import { verifyFindings } from '../core/verify'

const MESSAGES = messagesFor('en')
const CONTEXT = {
  cachedBlocks: [],
  diff: 'diff --git a/a.ts b/a.ts\n@@ -1,1 +1,3 @@\n function last(items) {\n+  if (items.length === 0)\n+    return\n',
  relatedCode: '',
  maxChars: 10_000,
}

function finding(overrides: Partial<Finding>): Finding {
  return { severity: 'critical', category: 'bug', file: 'a.ts', line: 3, title: 'Off by one', why: 'Skips the last item.', ...overrides }
}

function engineAnswering(text: string | Error, calls: string[] = []): Engine {
  return {
    askReviewModel: async (_system: string, _cached: string[], prompt: string) => {
      calls.push(prompt)
      if (text instanceof Error) throw text
      return { text, answeredBy: 'test' }
    },
  } as unknown as Engine
}

test('defects the second look rejects go to the PR list, marked; a decision without a defect stays as it was', async () => {
  const calls: string[] = []
  const [rejected, kept, skipped, decision] = await verifyFindings(
    engineAnswering('{"verdicts":[{"n":1,"keep":false,"handled_by":"if (items.length === 0) return"},{"n":2,"keep":true},{"n":4,"keep":false}]}', calls),
    [
      finding({}),
      finding({ category: 'suspicious', title: 'Sign flipped' }),
      finding({ title: 'Not in the answer' }),
      finding({ category: 'architecture', title: 'New layer' }),
    ],
    CONTEXT,
    MESSAGES,
  )

  expect(rejected?.severity).toBe('pr')
  expect(rejected?.why.startsWith(MESSAGES.notConfirmedNote)).toBe(true)
  expect(kept?.severity).toBe('critical')
  // A finding the answer skips stays as the review said.
  expect(skipped?.severity).toBe('critical')
  // Decisions are not right or wrong: no "keep" demotes one.
  expect(decision).toEqual(finding({ category: 'architecture', title: 'New layer' }))
  expect(calls.length).toBe(1)
  expect(calls[0]!.includes('4. NOTE')).toBe(true)
})

test('a note that hides a defect becomes a critical bug', async () => {
  const [note, plain] = await verifyFindings(
    engineAnswering('{"verdicts":[{"n":1,"defect":"An empty `items` returns undefined."}]}'),
    [finding({ severity: 'pr', category: 'routine', title: 'Last item helper changed' }), finding({ severity: 'pr', category: 'routine', title: 'Renamed' })],
    CONTEXT,
    MESSAGES,
  )

  expect(note).toEqual({ ...finding({ title: 'Last item helper changed' }), why: 'An empty `items` returns undefined.' })
  expect(plain?.severity).toBe('pr')
})

test('a rejection stands only on code the diff shows', async () => {
  const [noCode, madeUpCode] = await verifyFindings(
    engineAnswering('{"verdicts":[{"n":1,"keep":false},{"n":2,"keep":false,"handled_by":"if (items == null) return []"}]}'),
    [finding({}), finding({ title: 'Null items' })],
    CONTEXT,
    MESSAGES,
  )

  expect(noCode?.severity).toBe('critical')
  expect(madeUpCode?.severity).toBe('critical')
})

test('no verdict, no change: a failed call keeps the review answer, and nothing to check asks nothing', async () => {
  const findings = [finding({})]
  expect(await verifyFindings(engineAnswering(new Error('down')), findings, CONTEXT, MESSAGES)).toEqual(findings)

  const calls: string[] = []
  await verifyFindings(
    engineAnswering('{}', calls),
    [finding({ severity: 'pr', why: `${MESSAGES.preExistingNote} Old.` }), finding({ severity: 'pr', title: MESSAGES.notReviewedTitle })],
    CONTEXT,
    MESSAGES,
  )
  expect(calls.length).toBe(0)
})

test('a defect reported twice in other words is shown once', async () => {
  const findings = await verifyFindings(
    engineAnswering('{"verdicts":[{"n":1,"keep":true},{"n":2,"keep":true,"same_as":1}]}'),
    [finding({}), finding({ category: 'suspicious', title: 'Last item skipped' })],
    CONTEXT,
    MESSAGES,
  )

  expect(findings.map(({ title }) => title)).toEqual(['Off by one'])
})
