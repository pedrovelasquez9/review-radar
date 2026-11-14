// The prompt the "Request changes" buttons write: each finding, where it is,
// the problem it causes, and the code under review, so the session can fix it
// without any more context.

import type { Finding } from '../types'
import type { ChangeRequestParts, Messages } from './messages'
import { findingLocation } from './text-report'

export function buildChangeRequest(finding: Finding, messages: Messages): string {
  return messages.changeRequest(partsOf(finding))
}

// Every finding in one prompt, fixed in one pass; a single one reads as above.
export function buildChangeRequestForAll(findings: Finding[], messages: Messages): string {
  return findings.length === 1 ? buildChangeRequest(findings[0]!, messages) : messages.changeRequestForAll(findings.map(partsOf))
}

function partsOf(finding: Finding): ChangeRequestParts {
  return {
    category: finding.category,
    title: finding.title,
    location: findingLocation(finding),
    problem: finding.why,
    fencedExcerpt: finding.diffExcerpt ? fenceAsDiff(finding.diffExcerpt) : undefined,
  }
}

// A Markdown code fence longer than any run of backticks inside the code, so
// code that holds its own fences cannot close it early.
function fenceAsDiff(code: string): string {
  const longestBacktickRun = Math.max(0, ...(code.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1))
  return `${fence}diff\n${code}\n${fence}`
}
