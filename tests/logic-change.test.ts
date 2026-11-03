import { expect, test } from 'claude-code/testing'

import { hasLogicChange } from '../core/logic-change'

// A diff of `file` that replaces `removed` lines with `added` ones.
function change(file: string, removed: string[], added: string[]) {
  const body = [...removed.map(line => `-${line}`), ...added.map(line => `+${line}`)].join('\n')
  return { file, diffText: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,1 @@\n${body}\n` }
}

test('a flipped comparison, a new number or a new condition is a logic change', async () => {
  expect(hasLogicChange(change('src/cart.ts', ['if (total > limit) {'], ['if (total >= limit) {']))).toBe(true)
  expect(hasLogicChange(change('src/price.go', [], ['const discount = 0.15']))).toBe(true)
  expect(hasLogicChange(change('lib/auth.rb', [], ['return unless user.admin? && active']))).toBe(true)
  expect(hasLogicChange(change('src/order.py', ["if status == 'paid':"], ["if status == 'pending':"]))).toBe(true)
  // A removed check is a logic change too.
  expect(hasLogicChange(change('src/guard.ts', ['if (!user) throw new Error()'], []))).toBe(true)
})

test('renames, reformatting, copy, comments and imports are not', async () => {
  expect(hasLogicChange(change('src/cart.ts', ['if (total > limit) {'], ['if (sum  >  max) {']))).toBe(false)
  expect(hasLogicChange(change('src/hello.ts', ["const label = 'Hi'"], ["const label = 'Hello'"]))).toBe(false)
  expect(hasLogicChange(change('src/cart.ts', ['// limit is 10'], ['// limit is 20']))).toBe(false)
  expect(hasLogicChange(change('src/cart.ts', [], ["import { max } from './limits'"]))).toBe(false)
})

test('docs, styles and tests never count', async () => {
  expect(hasLogicChange(change('README.md', [], ['If the total is over 100, a discount applies.']))).toBe(false)
  expect(hasLogicChange(change('src/app.css', [], ['width: 100px;']))).toBe(false)
  expect(hasLogicChange(change('tests/cart.test.ts', [], ['expect(total).toBe(90)']))).toBe(false)
})
