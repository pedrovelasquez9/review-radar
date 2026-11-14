// review-radar's Engine (core/engine.ts) for one case repository: real git in
// that folder, models through `complete`, the report kept in memory, and the
// session's intent taken from the case.

import { appendFileSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { Report } from '../types'
import { EMPTY_REPORT } from '../core/analysis'
import type { Engine } from '../core/engine'
import type { CompleteWithModel } from './claude-cli'

type BenchEngineInput = {
  directory: string
  request: string
  // Root-relative paths the case changed: what the agent edited this session.
  changedFiles: string[]
  reviewModel: string
  complete: CompleteWithModel
}

export type BenchEngine = Engine & { currentReport: () => Report }

const TRIAGE_MODEL = 'haiku'

export function createBenchEngine(input: BenchEngineInput): BenchEngine {
  let report: Report = EMPTY_REPORT

  const runCommand: Engine['runCommand'] = async (argv, timeoutMs) => {
    const child = Bun.spawn(argv, { cwd: input.directory, stdout: 'pipe', stderr: 'ignore' })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    try {
      const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
      return { exitCode, stdout }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    runCommand,
    readTextFile: async path => {
      try {
        return readFileSync(join(input.directory, path), 'utf8')
      } catch {
        return undefined
      }
    },
    askTriageModel: (system, prompt) =>
      input
        .complete({ model: TRIAGE_MODEL, effort: 'low', system, prompt, timeoutMs: 60_000 })
        .then(reply => reply.text)
        .catch(() => undefined),
    askReviewModel: async (system, cachedBlocks, prompt) => {
      const reply = await input.complete({
        model: input.reviewModel,
        effort: 'high',
        system,
        prompt: [...cachedBlocks, prompt].join('\n\n'),
        timeoutMs: 300_000,
      })
      // BENCH_LOG_DIR: keep each review call's answer, to see which call found what.
      if (process.env.BENCH_LOG_DIR) {
        appendFileSync(
          join(process.env.BENCH_LOG_DIR, `${basename(input.directory)}.log`),
          `\n=== ${system.slice(0, 60)}\n${reply.text}\n`,
        )
      }
      return { text: reply.text, answeredBy: input.reviewModel }
    },
    readReport: async () => report,
    updateReport: async change => {
      report = change(report)
    },
    // Edited files as absolute paths, the way the agent's tools name them.
    readSessionIntent: async () => {
      const root = (await runCommand(['git', 'rev-parse', '--show-toplevel'], 20_000)).stdout.trim()
      return { requests: [input.request], editedFiles: input.changedFiles.map(file => `${root}/${file}`) }
    },
    revealPane: () => {},
    showStatus: () => {},
    showToast: () => {},
    currentReport: () => report,
  }
}
