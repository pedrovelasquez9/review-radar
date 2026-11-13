// How one review of one case is scored, without a model judge:
// - a bug case is a hit when some flagged finding is in the defect's file and,
//   when it gives a line, within LINE_TOLERANCE lines of the defect; the other
//   flagged findings are extra alarms;
// - a strict hit also names the defect: its text holds one of the case's
//   keywords, so a finding that only sits near the bug does not count;
// - on a clean case every flagged finding is a false alarm.

import type { FlaggedFinding } from './arms'
import type { BenchCase } from './cases'
import { DEFECT_KEYWORDS } from './keywords'
import type { CaseRepo } from './repo'

// Models point at the condition above or the call below the defective line.
export const LINE_TOLERANCE = 3

// isStrictHit: undefined for mined cases until the judge (judge.ts) sets it,
// with namedInPrList (review-radar named the bug but listed it for the PR).
export type RunScore = { isHit?: boolean; isStrictHit?: boolean; namedInPrList?: boolean; alarms: number }

export function scoreRun(benchCase: BenchCase, repo: CaseRepo, flagged: FlaggedFinding[]): RunScore {
  if (benchCase.kind === 'clean') return { alarms: flagged.length }

  const isAtDefect = (finding: FlaggedFinding) =>
    repo.defectLines.some(
      defect =>
        finding.file === defect.file && (finding.line === undefined || Math.abs(finding.line - defect.line) <= LINE_TOLERANCE),
    )
  const keywords = DEFECT_KEYWORDS[benchCase.id] ?? []
  const namesDefect = (finding: FlaggedFinding) => keywords.some(keyword => finding.title.toLowerCase().includes(keyword))

  const hits = flagged.filter(isAtDefect)
  return { isHit: hits.length > 0, isStrictHit: keywords.length > 0 ? hits.some(namesDefect) : undefined, alarms: flagged.length - hits.length }
}
