// A second look at what the review found, in one call:
// - each defect the review calls critical ("bug", "suspicious") is read against
//   the code, and kept unless the code shows it handled. Those ruled out go to
//   the PR list, marked as not confirmed. The review prompt hunts bugs on
//   purpose (review.ts), which also yields false ones;
// - each other finding (a decision, a PR note) is read for a defect the review
//   saw and filed too low: "check that…" or "routine, but…". One with an input
//   that breaks the changed code becomes a critical bug;
// - a defect reported twice in other words is shown once.

import type { Finding } from '../types'
import { UNTRUSTED_DATA_RULE, wrapUntrusted } from './boundary'
import type { Engine } from './engine'
import { extractJsonObject } from './json'
import type { Messages } from './messages'

const CHECKED_CATEGORIES = new Set(['bug', 'suspicious'])

const VERIFY_SYSTEM_PROMPT = `You double-check a code review. Each numbered finding below is either a CLAIM (it says the diff has a defect) or a NOTE (a change the review left for a person to decide or to look at in the pull request). Read the code each one points at, the rest of the diff and the related code.
For a CLAIM, decide whether the defect is real. Reject it ("keep": false) only when you can quote the code that rules it out: the guard, default or check (in the diff or the related code) that already handles the case, or the code that keeps the input it names from reaching that line. Put that code, copied exactly, in "handled_by". Otherwise keep it ("keep": true).
For a NOTE, decide whether it hides a defect: an input or situation that can happen for which the changed code does the wrong thing (including what the note asks someone to "check" or "confirm"). If so, answer "defect": one sentence naming that input and what goes wrong, quoting the faulty code in backticks. A change that is only a choice, or could be right either way, is not a defect: answer nothing for it.
When several findings describe the same defect, judge the clearest one and answer each of the others with "same_as": <the number of that one>.
${UNTRUSTED_DATA_RULE}
Answer ONLY a JSON object: {"verdicts":[{"n":<finding number>,"keep":true|false,"handled_by":"<code, only when a claim is rejected>","defect":"<only for a note that hides a defect>","same_as":<number, only for a duplicate>}]}`

export function needsVerification(finding: Finding): boolean {
  return finding.severity === 'critical' && CHECKED_CATEGORIES.has(finding.category)
}

// A finding the review wrote about a change of this branch, not a defect claim:
// secrets and findings already marked (pre-existing, not reviewed) are left out.
function mayHideDefect(finding: Finding, messages: Messages): boolean {
  return (
    !needsVerification(finding) &&
    finding.category !== 'secrets' &&
    finding.title !== messages.notReviewedTitle &&
    !finding.why.startsWith(messages.preExistingNote)
  )
}

// `diff`: the reviewed diff (with its wider context); `relatedCode`: see related-code.ts.
export async function verifyFindings(
  engine: Engine,
  findings: Finding[],
  context: { cachedBlocks: string[]; diff: string; relatedCode: string; maxChars: number },
  messages: Messages,
): Promise<Finding[]> {
  const listed = findings.filter(finding => needsVerification(finding) || mayHideDefect(finding, messages))
  if (listed.length === 0) return findings

  const list = listed.map(
    (finding, index) =>
      `${index + 1}. ${needsVerification(finding) ? 'CLAIM' : 'NOTE'} ${finding.file}${finding.line ? `:${finding.line}` : ''} [${finding.category}] ${finding.title} — ${finding.why}`,
  )
  const prompt = [
    wrapUntrusted('findings', list.join('\n')),
    context.relatedCode === '' ? '' : `Related code outside the diff:\n${wrapUntrusted('related-code', context.relatedCode)}`,
    wrapUntrusted('diff', context.diff.slice(0, context.maxChars)),
  ]
    .filter(block => block !== '')
    .join('\n\n')

  let verdicts: Verdicts
  try {
    const answer = await engine.askReviewModel(VERIFY_SYSTEM_PROMPT, context.cachedBlocks, prompt)
    verdicts = readVerdicts(answer.text, listed, squash(withoutDiffMarks(context.diff.slice(0, context.maxChars)) + context.relatedCode))
  } catch {
    // No verdict: the review's own answer stands.
    return findings
  }
  return findings
    .filter(finding => !verdicts.duplicates.has(finding))
    .map((finding): Finding => {
      if (verdicts.rejected.has(finding)) return { ...finding, severity: 'pr', why: `${messages.notConfirmedNote} ${finding.why}`.trim() }
      const defect = verdicts.defects.get(finding)
      return defect === undefined ? finding : { ...finding, severity: 'critical', category: 'bug', why: defect }
    })
}

type Verdicts = { rejected: Set<Finding>; duplicates: Set<Finding>; defects: Map<Finding, string> }

// Only an explicit `"keep": false` on a claim that quotes code found in the
// diff or the related code rejects: a claim the answer skips, or rejects on a
// hunch, stays (in the bench, unsupported rejections dropped real bugs). A
// note becomes a defect only with a "defect" sentence. A duplicate is dropped,
// and takes the verdict of the finding it repeats.
function readVerdicts(answer: string, listed: Finding[], shownCode: string): Verdicts {
  const parsed = JSON.parse(extractJsonObject(answer)) as { verdicts?: unknown }
  const verdicts: unknown[] = Array.isArray(parsed.verdicts) ? parsed.verdicts : []
  const rejected = new Set<Finding>()
  const defects = new Map<Finding, string>()
  const sameAs = new Map<Finding, Finding>()
  for (const raw of verdicts) {
    const verdict = raw as { n?: unknown; keep?: unknown; handled_by?: unknown; defect?: unknown; same_as?: unknown }
    const finding = typeof verdict.n === 'number' ? listed[verdict.n - 1] : undefined
    if (!finding) continue
    const original = typeof verdict.same_as === 'number' ? listed[verdict.same_as - 1] : undefined
    if (original && original !== finding) sameAs.set(finding, original)
    else if (needsVerification(finding)) {
      if (verdict.keep === false && quotesShownCode(verdict.handled_by, shownCode)) rejected.add(finding)
    } else if (typeof verdict.defect === 'string' && verdict.defect.trim() !== '') defects.set(finding, verdict.defect.trim())
  }
  // A chain (3 same as 2, 2 same as 1) would drop all three: only links to a finding kept as itself count.
  const duplicates = new Set([...sameAs].filter(([, original]) => !sameAs.has(original)).map(([finding]) => finding))
  return { rejected, duplicates, defects }
}

// Short quotes (`if (x)`) match too much of any diff to prove anything.
const MIN_HANDLED_BY_LENGTH = 8

function quotesShownCode(handledBy: unknown, shownCode: string): boolean {
  if (typeof handledBy !== 'string') return false
  const quote = squash(handledBy.replace(/^`+|`+$/g, ''))
  return quote.length >= MIN_HANDLED_BY_LENGTH && shownCode.includes(quote)
}

// A quote over several lines matches the diff without its +, - and space marks.
function withoutDiffMarks(diff: string): string {
  return diff.replace(/^[+ -]/gm, '')
}

function squash(text: string): string {
  return text.replace(/\s+/g, '')
}
