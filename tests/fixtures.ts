// Shared test data: a small diff, and a fake engine that answers like git and a model.

import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'

import type { Report } from '../types'
import { EMPTY_REPORT } from '../hooks/analysis'
import type { Engine } from '../hooks/engine'
import type { SessionIntent } from '../hooks/intent'

// Where the fake repository lives, as git prints it.
export const REPOSITORY_ROOT = 'C:/work/shop'

// A fake Stripe-style key, assembled from parts so that secret scanners (and
// GitHub's push protection) do not take this repository for one holding a real key.
const FAKE_STRIPE_KEY = ['sk', 'live', 'abcdefghijklmnop1234'].join('_')

export const PAY_DIFF = `diff --git a/src/pay.ts b/src/pay.ts
--- a/src/pay.ts
+++ b/src/pay.ts
@@ -10,2 +10,3 @@
 const a = 1
+const apiKey = "${FAKE_STRIPE_KEY}"
 const b = 2
`

export const LOCKFILE_DIFF = `diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-x
+y
`

// A one-hunk diff that adds `addedLine` as line 2 of `file`.
export function fileDiff(file: string, addedLine: string): string {
  return `diff --git a/${file} b/${file}
--- a/${file}
+++ b/${file}
@@ -1,1 +1,2 @@
 const first = 1
+${addedLine}
`
}

type FakeEngineOptions = {
  diff: string
  reviewAnswer: string
  // Models whose calls are refused, as an organization blocking a model would.
  blockedModels?: string[]
  // What the session recorded; edited files as absolute paths. None by default.
  sessionIntent?: SessionIntent
}

export type FakeEngine = Engine & {
  modelRequests: ModelCompleteRequest[]
  currentReport: () => Report
  setDiff: (diff: string) => void
}

export function createFakeEngine(options: FakeEngineOptions): FakeEngine {
  let diff = options.diff
  let report: Report = EMPTY_REPORT
  const modelRequests: ModelCompleteRequest[] = []

  // stdout for the git commands the analysis runs; undefined is a failed command.
  const answerGit = (gitArgs: string[]): string | undefined => {
    const command = gitArgs.join(' ')
    if (command === 'rev-parse --is-inside-work-tree') return 'true'
    if (command === 'rev-parse --show-toplevel') return REPOSITORY_ROOT
    if (command === 'rev-parse --abbrev-ref origin/HEAD') return 'origin/main'
    if (command.startsWith('rev-parse --verify')) return 'abc123'
    if (command.startsWith('merge-base')) return 'abc123'
    if (command.startsWith('diff ')) return diff
    if (command.startsWith('ls-files')) return ''
    return undefined
  }

  const answeredBy = (text: string): ModelCompleteResult => ({
    isAnswered: true,
    text,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  })

  return {
    runCommand: async argv => {
      const stdout = answerGit(argv.slice(1))
      return { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '' }
    },
    readTextFile: async () => undefined,
    completeWithModel: async request => {
      modelRequests.push(request)
      if (options.blockedModels?.includes(request.model)) throw new Error(`model ${request.model} is blocked`)
      return answeredBy(options.reviewAnswer)
    },
    readReport: async () => report,
    updateReport: async change => {
      report = change(report)
    },
    readSessionIntent: async () => options.sessionIntent ?? { requests: [], editedFiles: [] },
    showStatus: () => {},
    showToast: () => {},

    modelRequests,
    currentReport: () => report,
    setDiff: nextDiff => {
      diff = nextDiff
    },
  }
}
