import { expect, test } from 'claude-code/testing'

import { splitDiffByFile } from '../core/diff'
import { isIgnored, parseIgnoreRules, separateIgnoredFiles } from '../core/ignore-rules'
import { LOCKFILE_DIFF, PAY_DIFF } from './fixtures'

const DEFAULTS_ONLY = parseIgnoreRules('')

test('lockfiles and other generated files are kept out of what the models read', async () => {
  const files = splitDiffByFile(PAY_DIFF + LOCKFILE_DIFF).concat(
    ['dist/app.js', 'web/vendor.min.js', 'src/app.js.map', 'src/__snapshots__/cart.test.ts.snap', 'src/dist/real.ts'].map(
      file => ({ file, diffText: '' }),
    ),
  )
  const { sourceFiles, ignoredFiles } = separateIgnoredFiles(files, DEFAULTS_ONLY)

  expect(ignoredFiles).toEqual([
    'package-lock.json',
    'dist/app.js',
    'web/vendor.min.js',
    'src/app.js.map',
    'src/__snapshots__/cart.test.ts.snap',
  ])
  // Only the root's dist/ is build output.
  expect(sourceFiles.map(({ file }) => file)).toEqual(['src/pay.ts', 'src/dist/real.ts'])
})

test('the repository adds rules in gitignore syntax, and the last match decides', async () => {
  const rules = parseIgnoreRules(['# generated clients', 'api/gen/', '*.pb.go', '/vendor/**', '!yarn.lock', 'docs/**/*.svg'].join('\n'))

  expect(isIgnored('api/gen/client.ts', rules)).toBe(true)
  expect(isIgnored('services/api/gen/client.ts', rules)).toBe(false)
  expect(isIgnored('internal/user.pb.go', rules)).toBe(true)
  expect(isIgnored('vendor/lib/a.js', rules)).toBe(true)
  expect(isIgnored('src/vendor/a.js', rules)).toBe(false)
  expect(isIgnored('docs/img/flow.svg', rules)).toBe(true)
  // A default brought back by the repository.
  expect(isIgnored('yarn.lock', rules)).toBe(false)
  expect(isIgnored('Cargo.lock', rules)).toBe(true)
})

test('a pattern without a slash matches at any depth, and a folder pattern covers its files', async () => {
  const rules = parseIgnoreRules('build\ntmp?.txt\n[ab].ts')

  expect(isIgnored('build/out.js', rules)).toBe(true)
  expect(isIgnored('packages/web/build/out.js', rules)).toBe(true)
  expect(isIgnored('src/builder.ts', rules)).toBe(false)
  expect(isIgnored('tmp1.txt', rules)).toBe(true)
  expect(isIgnored('a.ts', rules)).toBe(true)
  expect(isIgnored('c.ts', rules)).toBe(false)
})
