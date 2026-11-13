// How many of the detectable real bugs a review names. A real bug is
// detectable when any arm, in any run of any report given, named it (strict,
// judge-scored): the rest may not show in the diff at all, or be SZZ noise.
//
//   bun bench/detectable.ts <results.json> ...
//
// For each report, prints radar's share of the detectable bugs it was run on:
// per run (what one review gives) and in either run.

import { readFileSync } from 'node:fs'

type BenchRecord = { caseId: string; kind: string; arm: string; run: number; score: { isStrictHit?: boolean } }

const files = process.argv.slice(2)
const reports = files.map(file => ({ file, records: (JSON.parse(readFileSync(file, 'utf8')) as { records: BenchRecord[] }).records }))

const detectable = new Set(
  reports.flatMap(({ records }) => records.filter(record => record.kind === 'bug' && record.score.isStrictHit).map(({ caseId }) => caseId)),
)

for (const { file, records } of reports) {
  const radar = records.filter(record => record.kind === 'bug' && record.arm === 'radar' && detectable.has(record.caseId))
  if (radar.length === 0) continue
  const cases = new Set(radar.map(({ caseId }) => caseId))
  const namedOnce = new Set(radar.filter(record => record.score.isStrictHit).map(({ caseId }) => caseId))
  const perRun = radar.filter(record => record.score.isStrictHit).length / radar.length
  const missed = [...cases].filter(caseId => !namedOnce.has(caseId))
  console.log(
    `${file}: per run ${Math.round(perRun * 100)}%, either run ${namedOnce.size}/${cases.size} (${Math.round((namedOnce.size / cases.size) * 100)}%)`,
  )
  console.log(`  never named: ${missed.join(', ') || '-'}`)
}
