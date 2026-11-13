// For mined cases (mine.ts), which have no keywords that name their defect: a
// model reads the commit that fixed the bug later and says which findings
// describe that bug, not just something near it. It sees the findings without
// knowing which arm wrote them.
//
//   bun bench/judge.ts bench/results/<run>.json [--model sonnet]
//
// writes a new report of that run with the judged scores; run.ts calls it too.

import { mkdtempSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { tmpdir } from 'node:os'

import { extractJsonObject } from '../core/json'
import type { FlaggedFinding } from './arms'
import type { CompleteWithModel } from './claude-cli'
import { claudeCli } from './claude-cli'
import type { RealCase } from './mine'
import { cloneDirectory, REAL_CASES_FILE } from './mine'
import { writeReport } from './report'
import type { BenchOptions, RunRecord } from './run'

const MAX_FIX_DIFF_CHARS = 15_000

const JUDGE_SYSTEM_PROMPT = `You check a code review against the truth. You get the commit that later fixed a bug, and numbered findings a reviewer wrote about the earlier change that introduced it.
A finding names the bug when it describes the same defect the fix corrects: the same wrong behaviour or its cause, even in other words or with a different fix in mind. Being in the same file or function, or describing another problem there, does not count. A vague warning ("check this logic") does not count.
Answer only with JSON: {"named":[<numbers of the findings that name the bug>]}`

// Sets each judged bug record's isStrictHit (a flagged finding names the bug)
// and namedInPrList (only one listed for the PR does).
export async function judgeRecords(records: RunRecord[], realCases: RealCase[], complete: CompleteWithModel, model: string): Promise<void> {
  const fixDiffs = new Map<string, string>()
  await Promise.all(
    records.map(async record => {
      const realCase = realCases.find(real => real.id === record.caseId)
      if (record.kind !== 'bug' || !realCase?.fixCommit || record.result.error) return
      const flagged = record.result.flagged
      const listed = record.result.listedForPr ?? []
      if (flagged.length + listed.length === 0) {
        record.score = { ...record.score, isStrictHit: false, namedInPrList: false }
        return
      }
      if (!fixDiffs.has(realCase.id)) fixDiffs.set(realCase.id, readFixCommit(realCase))
      const named = await judge(complete, model, fixDiffs.get(realCase.id)!, [...flagged, ...listed])
      record.score = {
        ...record.score,
        isStrictHit: named.some(index => index < flagged.length),
        namedInPrList: named.some(index => index >= flagged.length),
      }
    }),
  )
}

function readFixCommit(realCase: RealCase): string {
  const result = Bun.spawnSync(['git', 'show', '--no-color', '--format=%B', realCase.fixCommit!], {
    cwd: cloneDirectory(realCase.repository),
    stdout: 'pipe',
  })
  return result.stdout.toString().slice(0, MAX_FIX_DIFF_CHARS)
}

// The 0-based indexes of the findings the judge says name the bug.
async function judge(complete: CompleteWithModel, model: string, fixCommit: string, findings: FlaggedFinding[]): Promise<number[]> {
  const list = findings.map((finding, index) => `${index + 1}. ${finding.file}${finding.line ? `:${finding.line}` : ''} — ${finding.title}`)
  const prompt = `The fix:\n\n${fixCommit}\n\nThe findings:\n\n${list.join('\n')}`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await complete({ model, effort: 'medium', system: JUDGE_SYSTEM_PROMPT, prompt, timeoutMs: 180_000 })
      const parsed = JSON.parse(extractJsonObject(reply.text)) as { named?: unknown }
      if (!Array.isArray(parsed.named)) continue
      return parsed.named.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= findings.length).map(n => n - 1)
    } catch {
      // One more try; a judge that keeps failing counts as naming nothing.
    }
  }
  return []
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { model: { type: 'string', default: 'sonnet' } } })
  const resultsFile = positionals[0]!
  const { options, records } = JSON.parse(readFileSync(resultsFile, 'utf8')) as { options: BenchOptions; records: RunRecord[] }
  const realCases: RealCase[] = JSON.parse(readFileSync(REAL_CASES_FILE, 'utf8'))
  await judgeRecords(records, realCases, claudeCli(join(mkdtempSync(join(tmpdir(), 'review-radar-judge-')), 'cli')), values.model)
  const caseIds = new Set(records.map(record => record.caseId))
  const reportPath = writeReport(dirname(resultsFile), { ...options, judgeModel: values.model }, realCases.filter(real => caseIds.has(real.id)), records)
  console.log(`Report: ${reportPath}`)
}
