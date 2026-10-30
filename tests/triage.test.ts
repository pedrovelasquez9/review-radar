import { expect, test } from 'claude-code/testing'

import { splitDiffByFile } from '../hooks/diff'
import { buildTriagePrompt, mustAlwaysInspect, parseTriageAnswer } from '../hooks/triage'
import { LOCKFILE_DIFF, PAY_DIFF } from './fixtures'

const files = splitDiffByFile(PAY_DIFF + LOCKFILE_DIFF)

test('triage sees only the changed lines', async () => {
  const prompt = buildTriagePrompt(files)

  expect(prompt.includes('const a = 1')).toBe(false)
  expect(prompt.includes('+const apiKey')).toBe(true)
})

test('triage clears only the files the model calls routine', async () => {
  const triage = parseTriageAnswer('{"files":[{"file":"package-lock.json","verdict":"routine","note":"deps"}]}', files)

  expect([...triage.filesToInspect]).toEqual(['src/pay.ts'])
  expect(triage.titlesByFile.get('package-lock.json')).toBe('deps')
})

test('an unreadable triage answer clears nothing', async () => {
  expect(parseTriageAnswer('not json', files).filesToInspect.size).toBe(2)
})

test('data and config always get the deep review, whatever the stack', async () => {
  const dataAndConfigFiles = [
    'src/data/editions.ts',
    'config/app.rb',
    'db/migrations/001.go',
    'app.yaml',
    '.env.local',
    'infra/main.tf',
    'Dockerfile',
  ]
  const ordinaryFiles = ['src/components/Button.tsx', 'README.md', 'tests/pay.test.ts']

  for (const file of dataAndConfigFiles) expect(mustAlwaysInspect(file)).toBe(true)
  for (const file of ordinaryFiles) expect(mustAlwaysInspect(file)).toBe(false)
})
