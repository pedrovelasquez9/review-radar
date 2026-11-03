import { expect, test } from 'claude-code/testing'

import { excerptForFinding, findHunkContainingLine, separateGeneratedFiles, splitDiffByFile } from '../core/diff'
import { LOCKFILE_DIFF, PAY_DIFF } from './fixtures'

const payFileDiff = splitDiffByFile(PAY_DIFF)[0]?.diffText ?? ''

test('lockfiles and other generated files are kept out of what the models read', async () => {
  const files = splitDiffByFile(PAY_DIFF + LOCKFILE_DIFF).concat(
    ['dist/app.js', 'web/vendor.min.js', 'src/app.js.map', 'src/__snapshots__/cart.test.ts.snap', 'src/dist/real.ts'].map(
      file => ({ file, diffText: '' }),
    ),
  )
  const { sourceFiles, generatedFiles } = separateGeneratedFiles(files)

  expect(generatedFiles).toEqual([
    'package-lock.json',
    'dist/app.js',
    'web/vendor.min.js',
    'src/app.js.map',
    'src/__snapshots__/cart.test.ts.snap',
  ])
  // Only the root's dist/ is build output.
  expect(sourceFiles.map(({ file }) => file)).toEqual(['src/pay.ts', 'src/dist/real.ts'])
})

test('a finding shows the hunk that holds its line', async () => {
  expect(excerptForFinding(payFileDiff, 11).startsWith('@@ -10,2 +10,3 @@')).toBe(true)
  expect(excerptForFinding(payFileDiff, 11).includes('+const apiKey')).toBe(true)
  expect(excerptForFinding(payFileDiff).includes('+const apiKey')).toBe(true)
})

test('a line outside every hunk is not trusted', async () => {
  expect(findHunkContainingLine(payFileDiff, 11)).toBeTruthy()
  expect(findHunkContainingLine(payFileDiff, 400)).toBe(undefined)
})

test('a long hunk is cut around the line, with its header recounted', async () => {
  const addedLines = Array.from({ length: 200 }, (_, index) => `+line ${index + 1}`).join('\n')
  const newFileHunk = `@@ -0,0 +1,200 @@\n${addedLines}\n`

  const excerpt = excerptForFinding(newFileHunk, 150)

  expect(excerpt.includes('+line 150\n')).toBe(true)
  expect(excerpt.split('\n')[0]).toBe('@@ -0,0 +110,80 @@')
})
