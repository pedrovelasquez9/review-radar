// The review in the session's sidebar: where the analysis is, how many changes
// need a person, and one line per finding still to review. Clicking it opens
// the review dialog. Nothing shows until an analysis has found changes.

import type { TuiPluginApi } from '@opencode-ai/plugin/tui'

import type { Messages } from '../../core/messages'
import { findingLocation } from '../../core/text-report'
import { progressDescription, reviewKeyOf } from '../../core/report-view'
import type { Finding } from '../../types'
import { box, text, truncate } from './elements'
import type { Node } from './elements'
import type { ReviewStore } from './store'

// The sidebar is about 40 columns wide; past this many findings, a "+N" line.
const MAX_LISTED_FINDINGS = 5
const MAX_LINE_LENGTH = 34

type SidebarInput = {
  api: TuiPluginApi
  messages: Messages
  store: ReviewStore
  openReview: () => void
}

export function drawSidebar(input: SidebarInput): Node {
  const { store } = input
  return box({ flexDirection: 'column', paddingTop: 1, onMouseDown: input.openReview }, () =>
    store.isRevealed() ? drawReview(input) : null,
  )
}

function drawReview({ api, messages, store }: SidebarInput): Node[] {
  const theme = api.theme.current
  const report = store.report()
  const title = report.baseBranch ? `${messages.paneTitle} · ${report.baseBranch}` : messages.paneTitle
  const lines: Node[] = [text(title, { isBold: true, fg: theme.text })]

  if (report.status === 'analyzing') {
    lines.push(text(messages.loaderTitle(''), { fg: theme.warning }))
    lines.push(text(progressDescription(report, messages), { fg: theme.textMuted, wraps: true }))
    return lines
  }
  if (report.status === 'error') {
    lines.push(text(messages.analysisFailed(report.errorMessage ?? ''), { fg: theme.error, wraps: true }))
    return lines
  }

  const toReview = report.findings.filter(
    finding => finding.severity === 'critical' && !store.reviewedKeys().has(reviewKeyOf(finding)),
  )
  const prCount = report.findings.filter(finding => finding.severity === 'pr').length

  lines.push(
    toReview.length > 0
      ? text(`● ${messages.needsReviewHeading(toReview.length)}`, { fg: theme.warning })
      : text(`✓ ${messages.nothingCritical}`, { fg: theme.success }),
  )
  for (const finding of toReview.slice(0, MAX_LISTED_FINDINGS)) lines.push(...drawFindingLines(api, finding))
  if (toReview.length > MAX_LISTED_FINDINGS) {
    lines.push(text(`  +${toReview.length - MAX_LISTED_FINDINGS}`, { fg: theme.textMuted }))
  }
  if (prCount > 0) lines.push(text(messages.reviewInPrHeading(prCount), { fg: theme.textMuted }))
  lines.push(text(messages.openReviewHint, { fg: theme.textMuted }))
  return lines
}

// "▸ [category] title" and, under it, where the change is.
function drawFindingLines(api: TuiPluginApi, finding: Finding): Node[] {
  const theme = api.theme.current
  return [
    text(truncate(`▸ [${finding.category}] ${finding.title}`, MAX_LINE_LENGTH), { fg: theme.text }),
    text(truncate(`  ${findingLocation(finding)}`, MAX_LINE_LENGTH), { fg: theme.textMuted }),
  ]
}
