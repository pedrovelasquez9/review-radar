// The plugin's state: the latest report, the findings marked as reviewed, and
// whether the review shows yet. Kept in Solid signals so the sidebar and the
// dialog redraw when it changes, and in OpenCode's plugin storage (kv) per
// project folder, so it survives restarts.

import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import { createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'

import { EMPTY_REPORT, recoverInterruptedReport } from '../../core/analysis'
import type { Report } from '../../types'

// Bump when the Report type changes: a report stored by an older version is
// then dropped instead of misread.
const REPORT_SHAPE = 'report-5'

export type ReviewStore = {
  report: Accessor<Report>
  updateReport: (change: (report: Report) => Report) => void
  reviewedKeys: Accessor<ReadonlySet<string>>
  setReviewed: (reviewKey: string, isReviewed: boolean) => void
  // The review shows in the sidebar once an analysis has found changes to review.
  isRevealed: Accessor<boolean>
  reveal: () => void
}

export function createReviewStore(kv: TuiPluginApi['kv'], directory: string): ReviewStore {
  const reportKey = `review-radar.report:${directory}`
  const reviewedKey = `review-radar.reviewed:${directory}`

  const stored = kv.get<{ shape?: string; value?: Report } | undefined>(reportKey, undefined)
  // An analysis cut short by a restart goes back to what it showed before.
  const initialReport = stored?.shape === REPORT_SHAPE && stored.value ? recoverInterruptedReport(stored.value) : EMPTY_REPORT

  const [report, setReport] = createSignal<Report>(initialReport)
  const [reviewedKeys, setReviewedKeys] = createSignal<ReadonlySet<string>>(new Set(kv.get<string[]>(reviewedKey, [])))
  const [isRevealed, setIsRevealed] = createSignal(false)

  return {
    report,
    updateReport: change => {
      const next = change(report())
      setReport(next)
      kv.set(reportKey, { shape: REPORT_SHAPE, value: next })
    },
    reviewedKeys,
    setReviewed: (reviewKey, isReviewed) => {
      const next = new Set(reviewedKeys())
      if (isReviewed) next.add(reviewKey)
      else next.delete(reviewKey)
      setReviewedKeys(next)
      kv.set(reviewedKey, [...next])
    },
    isRevealed,
    reveal: () => setIsRevealed(true),
  }
}
