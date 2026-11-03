// What every review view shows the same way, whatever draws it.

import type { Finding, Report } from '../types'
import type { Messages } from './messages'

// Findings stored before review keys existed fall back to file, line and title.
export function reviewKeyOf(finding: Finding): string {
  return finding.reviewKey ?? `${finding.file}:${finding.line ?? ''}:${finding.title}`
}

// The dim line at the top of the review: what the analysis is doing, or the
// base branch once done.
export function reportHeadline(report: Report, messages: Messages, isAutoAnalysisOn: boolean): string {
  switch (report.status) {
    case 'no-repo':
      return messages.notAGitRepository
    case 'idle':
      return isAutoAnalysisOn ? messages.waitingForFirstTurn : messages.autoAnalysisOff
    case 'analyzing':
      return messages.loaderTitle(report.baseBranch)
    case 'error':
      return messages.analysisFailed(report.errorMessage ?? '')
    case 'ready':
      return messages.baseBranchLabel(report.baseBranch)
  }
}

// The loader's second line: the step the analysis is on.
export function progressDescription(report: Report, messages: Messages): string {
  const progress = report.progress ?? { step: 'reading-changes' }
  switch (progress.step) {
    case 'reading-changes':
      return messages.progressReadingChanges
    case 'triage':
      return messages.progressTriage(progress.fileCount)
    case 'deep-review': {
      const description = messages.progressDeepReview(progress.fileCount, progress.model)
      const hasParts = progress.part !== undefined && progress.partCount !== undefined
      return hasParts ? `${description} (${progress.part}/${progress.partCount})` : description
    }
  }
}
