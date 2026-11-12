// What the review model answers is a proposal; these rules decide what the
// person sees. They run without a model, so the same answer always ends the
// same way:
// - one defect reported twice (within a part, or across parts) is shown once;
// - a finding is critical only when the branch caused it: its file is in the
//   diff, and its line, when given, sits at a change. A problem in code the
//   branch did not touch is listed for the PR, marked as pre-existing.

import type { Finding } from '../types'
import { changedLinePositions } from './diff'
import type { Messages } from './messages'
import type { LineRange } from './related-code'

// How far from a changed line a finding still belongs to that change: the
// model often points at the condition above or the call below the edited line.
const LINES_NEAR_A_CHANGE = 3
// Two findings on the same file and category this close are candidates to be one.
const DUPLICATE_LINE_DISTANCE = 10
// Share of the shorter title's words the two titles must have in common.
const DUPLICATE_TITLE_OVERLAP = 0.5
// Words shorter than this carry no meaning of their own (articles, "of", "en").
const MIN_TITLE_WORD_LENGTH = 4

// `affectedRanges`: code outside the diff that uses a name the diff changed (see
// related-code.ts). A finding there is one the branch causes, not an old one.
export function applyFindingRules(
  findings: Finding[],
  diffByFile: Map<string, string>,
  messages: Messages,
  affectedRanges: readonly LineRange[] = [],
): Finding[] {
  return mergeDuplicates(findings).map(finding => markPreExisting(finding, diffByFile, affectedRanges, messages))
}

// Keeps the first of each group of findings that state the same defect; a
// critical one wins over a PR one.
export function mergeDuplicates(findings: Finding[]): Finding[] {
  const kept: Finding[] = []
  for (const finding of findings) {
    const index = kept.findIndex(other => isSameDefect(other, finding))
    if (index === -1) kept.push(finding)
    else if (finding.severity === 'critical' && kept[index]!.severity !== 'critical') kept[index] = finding
  }
  return kept
}

function isSameDefect(a: Finding, b: Finding): boolean {
  if (a.file !== b.file || a.category !== b.category) return false
  const isNear = a.line === undefined || b.line === undefined || Math.abs(a.line - b.line) <= DUPLICATE_LINE_DISTANCE
  return isNear && titleOverlap(a.title, b.title) >= DUPLICATE_TITLE_OVERLAP
}

function titleOverlap(a: string, b: string): number {
  const wordsA = titleWords(a)
  const wordsB = titleWords(b)
  const shorter = Math.min(wordsA.size, wordsB.size)
  if (shorter === 0) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
  const shared = [...wordsA].filter(word => wordsB.has(word)).length
  return shared / shorter
}

function titleWords(title: string): Set<string> {
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return new Set(words.filter(word => word.length >= MIN_TITLE_WORD_LENGTH))
}

// A critical finding the branch did not cause becomes a PR finding. Literal
// secrets stay critical wherever they are: a credential in the code is a risk
// whoever wrote it.
function markPreExisting(
  finding: Finding,
  diffByFile: Map<string, string>,
  affectedRanges: readonly LineRange[],
  messages: Messages,
): Finding {
  if (finding.severity !== 'critical' || finding.category === 'secrets') return finding
  if (isCausedByBranch(finding, diffByFile) || isInAffectedCode(finding, affectedRanges)) return finding
  return { ...finding, severity: 'pr', why: `${messages.preExistingNote} ${finding.why}`.trim() }
}

function isInAffectedCode(finding: Finding, affectedRanges: readonly LineRange[]): boolean {
  const line = finding.line
  return line !== undefined && affectedRanges.some(range => range.file === finding.file && line >= range.first && line <= range.last)
}

function isCausedByBranch(finding: Finding, diffByFile: Map<string, string>): boolean {
  const fileDiffText = diffByFile.get(finding.file)
  if (fileDiffText === undefined) return false
  // No line: a finding about the file as a whole, which the branch changed.
  if (finding.line === undefined) return true

  const line = finding.line
  return changedLinePositions(fileDiffText).some(changed => Math.abs(changed - line) <= LINES_NEAR_A_CHANGE)
}
