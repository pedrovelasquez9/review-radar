// The report as plain text: what /review-radar prints in the conversation.

import type { Finding, Report } from '../types'
import type { Messages } from './messages'

// `file:line`, or just the file when no line is known.
export function findingLocation(finding: Finding): string {
  return finding.line ? `${finding.file}:${finding.line}` : finding.file
}

export function formatReportAsText(report: Report, messages: Messages): string {
  if (report.status === 'error') return messages.analysisFailed(report.errorMessage ?? '')
  if (report.status === 'no-repo') return messages.notAGitRepository

  const criticalFindings = report.findings.filter(finding => finding.severity === 'critical')
  const prFindings = report.findings.filter(finding => finding.severity === 'pr')

  return [
    messages.textReportHeadline(report.baseBranch, report.summary),
    `${messages.needsReviewHeading(criticalFindings.length)}:`,
    ...criticalFindings.map(formatCriticalFinding),
    '',
    messages.textReportPrCount(prFindings.length),
  ].join('\n')
}

function formatCriticalFinding(finding: Finding): string {
  const heading = `\n[${finding.category}] ${finding.title} — ${findingLocation(finding)}\n${finding.why}`
  const excerpt = finding.diffExcerpt ? `\n\`\`\`diff\n${finding.diffExcerpt}\n\`\`\`` : ''
  return heading + excerpt
}
