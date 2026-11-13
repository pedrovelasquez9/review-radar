// A second look at the defects the review calls critical. The review prompt
// hunts bugs on purpose (review.ts), which also yields false ones; one more
// call reads each claimed defect against the code and keeps those it cannot
// rule out. The rest go to the PR list, marked as not confirmed. A defect the
// review and its second look reported in other words is shown once.
//
// Only "bug" and "suspicious" findings are checked: the other categories flag
// changes that need a decision, which are not right or wrong.

import type { Finding } from '../types'
import { UNTRUSTED_DATA_RULE, wrapUntrusted } from './boundary'
import type { Engine } from './engine'
import { extractJsonObject } from './json'
import type { Messages } from './messages'

const CHECKED_CATEGORIES = new Set(['bug', 'suspicious'])

const VERIFY_SYSTEM_PROMPT = `You double-check a code review. Each numbered finding claims a defect in the diff below. For each one, read the code it points at, the rest of the diff and the related code, and decide whether the defect is real.
Reject it ("keep": false) when the code already handles the case (a guard, a default, a check elsewhere in the diff or its callers), when the input it names cannot reach that code, when it describes code the branch did not change and does not make worse, or when it is only a wish for tests, logs or style.
Keep it ("keep": true) when the code, as changed, behaves wrongly for an input or situation that can happen, or when the code shown is not enough to rule it out.
When several findings describe the same defect, judge the clearest one and answer each of the others with "same_as": <the number of that one>.
${UNTRUSTED_DATA_RULE}
Answer ONLY a JSON object: {"verdicts":[{"n":<finding number>,"keep":true|false,"same_as":<number, only for a duplicate>}]}`

export function needsVerification(finding: Finding): boolean {
  return finding.severity === 'critical' && CHECKED_CATEGORIES.has(finding.category)
}

// `diff`: the reviewed diff (with its wider context); `relatedCode`: see related-code.ts.
export async function verifyFindings(
  engine: Engine,
  findings: Finding[],
  context: { cachedBlocks: string[]; diff: string; relatedCode: string; maxChars: number },
  messages: Messages,
): Promise<Finding[]> {
  const toCheck = findings.filter(needsVerification)
  if (toCheck.length === 0) return findings

  const list = toCheck.map(
    (finding, index) => `${index + 1}. ${finding.file}${finding.line ? `:${finding.line}` : ''} [${finding.category}] ${finding.title} — ${finding.why}`,
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
    verdicts = readVerdicts(answer.text, toCheck)
  } catch {
    // No verdict: the review's own answer stands.
    return findings
  }
  return findings
    .filter(finding => !verdicts.duplicates.has(finding))
    .map(finding =>
      verdicts.rejected.has(finding) ? { ...finding, severity: 'pr', why: `${messages.notConfirmedNote} ${finding.why}`.trim() } : finding,
    )
}

type Verdicts = { rejected: Set<Finding>; duplicates: Set<Finding> }

// Only an explicit `"keep": false` rejects: a finding the answer skips stays. A
// duplicate is dropped, and takes the verdict of the finding it repeats.
function readVerdicts(answer: string, checked: Finding[]): Verdicts {
  const parsed = JSON.parse(extractJsonObject(answer)) as { verdicts?: unknown }
  const verdicts: unknown[] = Array.isArray(parsed.verdicts) ? parsed.verdicts : []
  const rejected = new Set<Finding>()
  const sameAs = new Map<Finding, Finding>()
  for (const raw of verdicts) {
    const verdict = raw as { n?: unknown; keep?: unknown; same_as?: unknown }
    const finding = typeof verdict.n === 'number' ? checked[verdict.n - 1] : undefined
    const original = typeof verdict.same_as === 'number' ? checked[verdict.same_as - 1] : undefined
    if (finding && original && original !== finding) sameAs.set(finding, original)
    else if (finding && verdict.keep === false) rejected.add(finding)
  }
  // A chain (3 same as 2, 2 same as 1) would drop all three: only links to a finding kept as itself count.
  const duplicates = new Set([...sameAs].filter(([, original]) => !sameAs.has(original)).map(([finding]) => finding))
  return { rejected, duplicates }
}
