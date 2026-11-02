// The hooks module in a simulated session: when the pane opens by itself.

import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { REPOSITORY_ROOT, fileDiff } from './fixtures'

// The test runtime has timers, but this project's types carry no DOM or Node library.
declare function setTimeout(callback: (value?: unknown) => void, ms: number): unknown

type TestEngine = Parameters<TestBody>[0]
type TestOn = Parameters<TestBody>[1]

const REVIEW_ANSWER = JSON.stringify({ summary: 'Changes pricing.', findings: [] })

// The fake repository git answers for: its branch diff against main, or no repository at all.
type FakeRepository = { diff: string; isRepository: boolean }

// stdout for the git commands the analysis runs; undefined is a failed command.
function answerGit(repository: FakeRepository, gitArgs: readonly string[]): string | undefined {
  if (!repository.isRepository) return undefined

  const command = gitArgs.join(' ')
  if (command === 'rev-parse --is-inside-work-tree') return 'true'
  if (command === 'rev-parse --show-toplevel') return REPOSITORY_ROOT
  if (command === 'rev-parse --abbrev-ref origin/HEAD') return 'origin/main'
  if (command.startsWith('rev-parse --verify') || command.startsWith('merge-base')) return 'abc123'
  if (command.startsWith('diff ')) return repository.diff
  if (command.startsWith('ls-files')) return ''
  return undefined
}

// Answers what sits beneath the plugins in a real session, with `repository`
// as the working tree. Returns the ids of the panes opened, in order.
//
// Events the engine raises (session.start, tool.call, turn.complete) are
// answered with their result; calls a hook makes on `$` with `{ value }`.
function simulateSession(on: TestOn, repository: FakeRepository): string[] {
  const openedPanes: string[] = []

  on('session.start', () => ({ cwd: REPOSITORY_ROOT }))
  on('tool.call', () => ({ result: '' }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('command.register', () => ({ value: { isRegistered: true } }) as never)
  on('session.messages', () => ({ value: { messages: [] } }) as never)
  on('ui.status', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: {} }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: REVIEW_ANSWER } }) as never)
  on('process.run', (_, event: { argv: readonly string[] }) => {
    const stdout = answerGit(repository, event.argv.slice(1))
    return { value: { exitCode: stdout === undefined ? 128 : 0, stdout: stdout ?? '', stderr: '' } } as never
  })
  on('ui.open', (_, event: { id: string }) => {
    openedPanes.push(event.id)
    return { value: { isPlaced: true } } as never
  })

  return openedPanes
}

// A turn in which Claude edited a file, then ended.
async function runEditingTurn($: TestEngine): Promise<void> {
  await $.tool.call({ tool: 'Edit', input: {} } as never)
  await $.turn.complete({ reason: 'answer', answer: '', isAborted: false } as never)
  await waitForQueuedAnalysis()
}

// The hooks queue the analysis without awaiting it; this gives it time to end.
async function waitForQueuedAnalysis(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
}

test('the pane opens once, after the first turn that leaves changes in a repository', async ($, on) => {
  const repository: FakeRepository = { diff: '', isRepository: true }
  const openedPanes = simulateSession(on, repository)

  // A branch with no changes: starting the session opens nothing.
  await $.session.start({ cwd: REPOSITORY_ROOT, surface: 'terminal', isInteractive: true } as never)
  await waitForQueuedAnalysis()
  expect(openedPanes).toEqual([])

  // A turn that edits a file leaves changes: the pane opens.
  repository.diff = fileDiff('src/price.ts', 'const discount = 0.15')
  await runEditingTurn($)
  expect(openedPanes).toEqual(['review-radar'])

  // Later turns with new changes do not open it again.
  repository.diff += fileDiff('src/cart.ts', 'const items = []')
  await runEditingTurn($)
  expect(openedPanes).toEqual(['review-radar'])
})

test('outside a repository the pane never opens by itself', async ($, on) => {
  const openedPanes = simulateSession(on, { diff: '', isRepository: false })

  await $.session.start({ cwd: REPOSITORY_ROOT, surface: 'terminal', isInteractive: true } as never)
  await runEditingTurn($)

  expect(openedPanes).toEqual([])
})
