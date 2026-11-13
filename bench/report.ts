// The benchmark's report: the totals per arm, then each case, in Markdown, and
// every run's raw result in JSON next to it.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Arm } from './arms'
import type { BenchCase } from './cases'
import type { BenchOptions, RunRecord } from './run'
import { LINE_TOLERANCE } from './score'

export function writeReport(directory: string, options: BenchOptions, cases: BenchCase[], records: RunRecord[]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = `${stamp}-${options.model}${options.isDryRun ? '-dry-run' : ''}`
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({ options, records }, null, 2))

  const lines = [
    `# review-radar bench · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    `Model **${options.model}**, ${options.runs} run(s) per case, ${cases.length} cases (${count(cases, 'bug')} with a planted bug, ${count(cases, 'clean')} clean).${options.isDryRun ? ' **Dry run: scripted answers, no model.**' : ''}`,
    `A bug counts as found when a flagged finding is in its file, within ${LINE_TOLERANCE} lines when it gives one; as named (strict) when ` +
      (options.judgeModel
        ? `a flagged finding, anywhere, describes the bug the later fix corrects, as ${options.judgeModel} judges it from that fix commit (bench/judge.ts).`
        : 'that finding also uses one of the words that name the defect (bench/keywords.ts).'),
    '',
    '| | ' + options.arms.join(' | ') + ' |',
    '| --- | ' + options.arms.map(() => '---').join(' | ') + ' |',
    ...summaryRows(options.arms, records),
    '',
    '## Per case',
    '',
    '| Case | ' + options.arms.join(' | ') + ' |',
    '| --- | ' + options.arms.map(() => '---').join(' | ') + ' |',
    ...cases.map(benchCase => `| ${benchCase.id} | ${options.arms.map(arm => caseCell(benchCase, arm, records)).join(' | ')} |`),
    '',
    ...errorLines(records),
  ]
  const path = join(directory, `${name}.md`)
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

function summaryRows(arms: Arm[], records: RunRecord[]): string[] {
  const of = (arm: Arm, kind?: BenchCase['kind']) =>
    records.filter(record => record.arm === arm && (kind === undefined || record.kind === kind) && !record.result.error)
  const percent = (part: number, whole: number) => (whole === 0 ? '–' : `${Math.round((100 * part) / whole)}% (${part}/${whole})`)
  const average = (values: number[]) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length)

  const row = (label: string, cell: (arm: Arm) => string) => `| ${label} | ${arms.map(cell).join(' | ')} |`
  // Mined cases name their defect only once judged: no strict row before.
  const isStrictScored = records.some(record => record.score.isStrictHit !== undefined)
  const isJudged = records.some(record => record.score.namedInPrList !== undefined)
  return [
    row('Bugs found', arm => percent(of(arm, 'bug').filter(record => record.score.isHit).length, of(arm, 'bug').length)),
    ...(isStrictScored
      ? [row('Bugs found and named (strict)', arm => percent(of(arm, 'bug').filter(record => record.score.isStrictHit).length, of(arm, 'bug').length))]
      : []),
    ...(isJudged
      ? [row('Named, but only in the PR list', arm => (arm === 'radar' ? percent(of(arm, 'bug').filter(record => !record.score.isStrictHit && record.score.namedInPrList).length, of(arm, 'bug').length) : '–'))]
      : []),
    row('Clean changes without alarms', arm =>
      percent(of(arm, 'clean').filter(record => record.score.alarms === 0).length, of(arm, 'clean').length),
    ),
    row('False alarms per clean change', arm => average(of(arm, 'clean').map(record => record.score.alarms)).toFixed(2)),
    row('Extra alarms per bug change', arm => average(of(arm, 'bug').map(record => record.score.alarms)).toFixed(2)),
    row('Cost per review (USD, estimate)', arm => average(of(arm).map(record => record.result.costUsd)).toFixed(3)),
    row('Time per review (s)', arm => (average(of(arm).map(record => record.result.durationMs)) / 1000).toFixed(1)),
    row('Failed reviews', arm => String(records.filter(record => record.arm === arm && record.result.error).length)),
  ]
}

// A bug: how many runs found it; a clean case: the false alarms in each run.
function caseCell(benchCase: BenchCase, arm: Arm, records: RunRecord[]): string {
  const runs = records.filter(record => record.caseId === benchCase.id && record.arm === arm && !record.result.error)
  if (runs.length === 0) return '–'
  if (benchCase.kind === 'bug') {
    const found = runs.filter(record => record.score.isHit).length
    const named = runs.filter(record => record.score.isStrictHit).length
    return `${found}/${runs.length} found, ${named} named`
  }
  return `alarms: ${runs.map(record => record.score.alarms).join(', ')}`
}

function errorLines(records: RunRecord[]): string[] {
  const failed = records.filter(record => record.result.error)
  if (failed.length === 0) return []
  return ['## Failed reviews', '', ...failed.map(record => `- ${record.caseId} · ${record.arm} #${record.run}: ${record.result.error}`), '']
}

function count(cases: BenchCase[], kind: BenchCase['kind']): number {
  return cases.filter(benchCase => benchCase.kind === kind).length
}
