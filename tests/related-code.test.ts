import { expect, test } from 'claude-code/testing'

import type { Engine } from '../core/engine'
import { namesInDiff, readRelatedCode } from '../core/related-code'

function fileDiff(file: string, body: string) {
  return { file, diffText: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,3 @@\n${body}\n` }
}

test('top-level declarations, config keys and called functions are searched; locals are not', async () => {
  const { changedNames, calledNames } = namesInDiff([
    fileDiff(
      'src/orders.ts',
      [
        "-export type OrderStatus = 'paid'",
        "+export type OrderStatus = 'paid' | 'cancelled'",
        '+  const subtotal = subtotalCents(lines)',
        '+  return discountCents(promoRate, subtotal) + Math.round(x) + order.total(1)',
      ].join('\n'),
    ),
    fileDiff('config/app.json', '-  "sessionMinutes": 30,\n+  "sessionTtlMinutes": 30,'),
  ])

  expect(changedNames).toEqual(['OrderStatus', 'sessionMinutes', 'sessionTtlMinutes'])
  // Math.round and order.total are not the project's functions to look up.
  expect(calledNames).toEqual(['subtotalCents', 'discountCents'])
})

test('usages outside the diff are shown with the lines after them, each place once', async () => {
  const orders = [
    "export type OrderStatus = 'paid' | 'cancelled'",
    '',
    'export function statusLabel(status: OrderStatus): string {',
    '  switch (status) {',
    "    case 'paid':",
    "      return 'Paid'",
    '  }',
    '}',
  ].join('\n')
  const engine = {
    runCommand: async (argv: string[]) => {
      const command = argv.slice(1).join(' ')
      if (command === 'rev-parse --show-prefix') return { exitCode: 0, stdout: '\n' }
      if (command.startsWith('grep') && command.includes('OrderStatus'))
        return { exitCode: 0, stdout: 'src/orders.ts:1:export type OrderStatus\nsrc/orders.ts:3:export function statusLabel(status: OrderStatus)\nREADME.md:4:OrderStatus is…\n' }
      return { exitCode: 1, stdout: '' }
    },
    readTextFile: async (path: string) => (path === 'src/orders.ts' ? orders : undefined),
  } as unknown as Engine

  // The diff changes line 40, so the usages on lines 1 and 3 are outside it.
  const { text: related, affectedRanges } = await readRelatedCode(
    engine,
    [fileDiff('src/orders.ts', "-export type OrderStatus = 'paid'\n+export type OrderStatus = 'paid' | 'cancelled'").diffText.replace('@@ -1,1 +1,3 @@', '@@ -40,1 +40,1 @@')].map(
      diffText => ({ file: 'src/orders.ts', diffText }),
    ),
    10_000,
  )

  expect(related.startsWith('### src/orders.ts (OrderStatus)\n1: export type OrderStatus')).toBe(true)
  expect(related.includes("4:   switch (status) {")).toBe(true)
  // Line 3 sits inside the excerpt of line 1, and prose files are left out.
  expect(related.match(/^### /gm)?.length).toBe(1)
  expect(related.includes('README')).toBe(false)
  // A usage of a changed name: code the branch can break.
  expect(affectedRanges).toEqual([{ file: 'src/orders.ts', first: 1, last: 8 }])
})
