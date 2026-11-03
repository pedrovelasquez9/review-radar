import { expect, test } from 'claude-code/testing'

import { analyzeBranch } from '../core/analysis'
import { chooseContextFiles } from '../core/project-context'
import { DEFAULT_SETTINGS } from '../hooks/settings'
import { createFakeEngine, fileDiff } from './fixtures'

test('agent files from the root down come first, then the README, then the docs', async () => {
  const paths = [
    'docs/pricing.md',
    'README.md',
    'src/billing/CLAUDE.md',
    'src/catalog/AGENTS.md',
    'CLAUDE.md',
    'docs/api.mdx',
    'notes/todo.md',
    'src/README.md',
  ]

  const chosen = chooseContextFiles(paths, ['src/billing/invoice.ts']).map(({ path }) => path)

  // src/catalog/AGENTS.md speaks for code nobody changed; notes/ and src/README.md are not docs.
  expect(chosen).toEqual(['CLAUDE.md', 'src/billing/CLAUDE.md', 'README.md', 'docs/api.mdx', 'docs/pricing.md'])
})

test('the review reads the project docs as business context', async () => {
  const engine = createFakeEngine({
    diff: fileDiff('src/price.ts', 'const discount = 0.15'),
    reviewAnswer: '{"summary":"s","findings":[]}',
    projectDocs: { 'AGENTS.md': 'Discounts never go above 10%.', 'README.md': 'A shop.' },
  })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  const prompt = String(engine.modelRequests[0]?.prompt)
  expect(prompt.includes("The project's own docs, for business context")).toBe(true)
  expect(prompt.includes('### AGENTS.md\nDiscounts never go above 10%.')).toBe(true)
  expect(prompt.indexOf('AGENTS.md') < prompt.indexOf('README.md')).toBe(true)
})

test('long docs are cut to the context budget', async () => {
  const engine = createFakeEngine({
    diff: fileDiff('src/price.ts', 'const discount = 0.15'),
    reviewAnswer: '{"summary":"s","findings":[]}',
    projectDocs: { 'CLAUDE.md': 'x'.repeat(50_000), 'README.md': 'A shop.' },
  })

  // A fifth of a 20,000-character budget: 4,000 characters of docs.
  await analyzeBranch(engine, { ...DEFAULT_SETTINGS, reviewBudgetChars: 20_000 }, false)

  const prompt = String(engine.modelRequests[0]?.prompt)
  expect(prompt.includes('x'.repeat(4_000))).toBe(true)
  expect(prompt.includes('x'.repeat(4_001))).toBe(false)
  expect(prompt.includes('A shop.')).toBe(false)
})

test('without docs the prompt has no project context', async () => {
  const engine = createFakeEngine({
    diff: fileDiff('src/price.ts', 'const discount = 0.15'),
    reviewAnswer: '{"summary":"s","findings":[]}',
  })

  await analyzeBranch(engine, DEFAULT_SETTINGS, false)

  expect(String(engine.modelRequests[0]?.prompt).includes("project's own docs")).toBe(false)
})
