// Runs the benchmark and writes its report to bench/results/.
//
//   bun bench/run.ts [--model opus] [--runs 2] [--arms radar,baseline]
//                    [--cases bug-,clean-readme] [--parallel 3] [--dry-run]
//
// --dry-run asks no model: a scripted answer flags exactly each planted defect,
// which checks the cases, the repositories, review-radar's rules and the
// scoring end to end (it must score every bug and no false alarm).

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import type { Arm, ArmResult } from './arms'
import { runBaseline, runRadar } from './arms'
import type { BenchCase } from './cases'
import { CASES } from './cases'
import type { CompleteWithModel } from './claude-cli'
import { claudeCli } from './claude-cli'
import { createCaseRepo } from './repo'
import type { CaseRepo } from './repo'
import { writeReport } from './report'
import { scoreRun } from './score'
import type { RunScore } from './score'

export type RunRecord = { caseId: string; kind: BenchCase['kind']; arm: Arm; run: number; result: ArmResult; score: RunScore }

export type BenchOptions = { model: string; runs: number; arms: Arm[]; isDryRun: boolean }

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'opus' },
    runs: { type: 'string', default: '2' },
    arms: { type: 'string', default: 'radar,baseline' },
    cases: { type: 'string' },
    parallel: { type: 'string', default: '3' },
    'dry-run': { type: 'boolean', default: false },
  },
})

const options: BenchOptions = {
  model: values.model,
  runs: Number(values.runs),
  arms: values.arms.split(',').filter((arm): arm is Arm => arm === 'radar' || arm === 'baseline'),
  isDryRun: values['dry-run'],
}
const casePrefixes = values.cases?.split(',')
const cases = CASES.filter(benchCase => !casePrefixes || casePrefixes.some(prefix => benchCase.id.startsWith(prefix)))

const workRoot = mkdtempSync(join(tmpdir(), 'review-radar-bench-'))
const realModel = claudeCli(join(workRoot, 'cli'))

const reviews = cases.length * options.runs * options.arms.length
console.log(
  `${cases.length} cases × ${options.runs} runs × ${options.arms.join(' + ')} = ${reviews} reviews with ${options.model}` +
    (options.isDryRun ? ' (dry run: no model calls)' : ''),
)

// One tiny call first: a CLI that is not signed in fails here, not in every review.
if (!options.isDryRun) {
  try {
    await realModel({ model: 'haiku', effort: 'low', system: 'Reply with: ok', prompt: 'ok?', timeoutMs: 60_000 })
  } catch (error) {
    console.error(`The claude CLI cannot answer: ${String(error)}\nSign in with "claude auth login", then run the bench again.`)
    rmSync(workRoot, { recursive: true, force: true })
    process.exit(1)
  }
}

// Each case's repository is built once and only read by its reviews.
const repos = new Map<string, CaseRepo>()
for (const benchCase of cases) repos.set(benchCase.id, createCaseRepo(benchCase, join(workRoot, benchCase.id)))

const tasks = cases.flatMap(benchCase =>
  Array.from({ length: options.runs }, (_, run) => options.arms.map(arm => ({ benchCase, arm, run: run + 1 }))).flat(),
)

const records: RunRecord[] = []
let done = 0
await runInPool(tasks, Number(values.parallel), async ({ benchCase, arm, run }) => {
  const repo = repos.get(benchCase.id)!
  const complete = options.isDryRun ? scriptedModel(benchCase, repo) : realModel
  const result =
    arm === 'radar' ? await runRadar(benchCase, repo, options.model, complete) : await runBaseline(repo, options.model, complete)
  const score = scoreRun(benchCase, repo, result.flagged)
  records.push({ caseId: benchCase.id, kind: benchCase.kind, arm, run, result, score })
  done += 1
  const outcome = result.error ? `error: ${result.error.slice(0, 80)}` : benchCase.kind === 'bug' ? (score.isHit ? 'hit' : 'MISS') : `${score.alarms} alarm(s)`
  console.log(`[${done}/${tasks.length}] ${benchCase.id} · ${arm} #${run}: ${outcome}`)
})

const resultsDirectory = join(import.meta.dir, 'results')
mkdirSync(resultsDirectory, { recursive: true })
const reportPath = writeReport(resultsDirectory, options, cases, records)
console.log(`\nReport: ${reportPath}`)
rmSync(workRoot, { recursive: true, force: true })

// Up to `size` tasks at a time.
async function runInPool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }
  await Promise.all(Array.from({ length: Math.max(1, size) }, worker))
}

// The dry run's model: it answers the review with exactly the planted defect
// (none on a clean case), the baseline the same way, and the triage with nothing.
function scriptedModel(benchCase: BenchCase, repo: CaseRepo): CompleteWithModel {
  const place = repo.defectLines[0]
  return async ({ system }) => {
    const isRadarReview = system.startsWith('You review a code diff')
    const isBaseline = system.startsWith('You are a code reviewer')
    const findings =
      place && (isRadarReview || isBaseline)
        ? [{ severity: 'critical', category: benchCase.defect?.category, file: place.file, line: place.line, title: 'Planted defect', why: '' }]
        : []
    const text = isRadarReview || isBaseline ? JSON.stringify({ summary: 'Scripted.', findings }) : '{}'
    return { text, costUsd: 0, durationMs: 0 }
  }
}
