// How one review of one case is scored, without a model judge:
// - a bug case is a hit when some flagged finding is in the defect's file and,
//   when it gives a line, within LINE_TOLERANCE lines of the defect; the other
//   flagged findings are extra alarms;
// - on a clean case every flagged finding is a false alarm.

import type { FlaggedFinding } from './arms'
import type { BenchCase } from './cases'
import type { CaseRepo } from './repo'

// Models point at the condition above or the call below the defective line.
export const LINE_TOLERANCE = 3

export type RunScore = { isHit?: boolean; alarms: number }

export function scoreRun(benchCase: BenchCase, repo: CaseRepo, flagged: FlaggedFinding[]): RunScore {
  if (benchCase.kind === 'clean') return { alarms: flagged.length }

  const isAtDefect = (finding: FlaggedFinding) =>
    repo.defectLines.some(
      defect =>
        finding.file === defect.file && (finding.line === undefined || Math.abs(finding.line - defect.line) <= LINE_TOLERANCE),
    )
  const hits = flagged.filter(isAtDefect).length
  return { isHit: hits > 0, alarms: flagged.length - hits }
}
