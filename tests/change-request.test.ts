import { expect, test } from 'claude-code/testing'

import type { Finding } from '../types'
import { buildChangeRequest } from '../core/change-request'
import { messagesFor } from '../core/messages'

const DISCOUNT_FINDING: Finding = {
  severity: 'critical',
  category: 'business-logic',
  file: 'src/price.ts',
  line: 4,
  title: 'New discount',
  why: 'The discount is applied twice when a coupon is present.',
  diffExcerpt: '@@ -3,1 +3,2 @@\n const base = 10\n+const discount = 0.15',
}

test('a change request carries the finding, its place, the problem and the code', async () => {
  const request = buildChangeRequest(DISCOUNT_FINDING, messagesFor('en'))

  expect(request.includes('Finding: [business-logic] New discount')).toBe(true)
  expect(request.includes('Where: src/price.ts:4')).toBe(true)
  expect(request.includes('Problem: The discount is applied twice when a coupon is present.')).toBe(true)
  expect(request.includes('```diff\n@@ -3,1 +3,2 @@\n const base = 10\n+const discount = 0.15\n```')).toBe(true)
  expect(request.includes('Correct the problem described above')).toBe(true)
})

test('a change request is written in the configured language', async () => {
  const request = buildChangeRequest(DISCOUNT_FINDING, messagesFor('es'))

  expect(request.includes('Hallazgo: [business-logic] New discount')).toBe(true)
  expect(request.includes('Dónde: src/price.ts:4')).toBe(true)
  expect(request.includes('Corrige el problema descrito arriba')).toBe(true)
})

test('code holding its own fence gets a longer one', async () => {
  const markdownFinding = { ...DISCOUNT_FINDING, diffExcerpt: '@@ -1 +1 @@\n-```js\n+```ts' }

  const request = buildChangeRequest(markdownFinding, messagesFor('en'))

  expect(request.includes('````diff\n')).toBe(true)
  expect(request.endsWith('````\n\nCorrect the problem described above, or revert the change if it should not be there. Keep everything else as it is, and tell me what you changed.\n')).toBe(true)
})

test('a finding without an excerpt leaves the code section out', async () => {
  const request = buildChangeRequest({ ...DISCOUNT_FINDING, diffExcerpt: undefined }, messagesFor('en'))

  expect(request.includes('Code under review')).toBe(false)
})
