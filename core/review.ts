// Stage 2 of the analysis: the deep review. What the review model is told and
// how its answer is read.

import type { Finding } from '../types'
import type { SessionIntent } from './intent'
import { extractJsonObject } from './json'

export type ReviewAnswer = { summary: string; findings: Finding[] }

export type ReviewPromptInput = {
  // Diff of the files to review in depth.
  diff: string
  lockfiles: string[]
  routineFiles: string[]
  // Files the deep review reads in another part of this analysis.
  otherPartFiles: string[]
  // Which part this is, when the deep review is split into several.
  part?: { index: number; count: number }
  // Files reviewed in an earlier analysis and unchanged since.
  unchangedFiles: string[]
  earlierCriticalFindings: Finding[]
  // What the person asked for and what the agent edited in this session, when known.
  sessionIntent?: SessionIntent
  maxDiffChars: number
}

// Stack-agnostic: the model judges each change by what it does, not by framework.
export function reviewSystemPrompt(languageName: string): string {
  return `You review a code diff for a developer who must decide what needs human eyes before merging.
Judge each change by WHAT IT DOES, never by framework or language. Mark as "critical" only changes that need a human decision:
- business-logic: rules, calculations, pricing, permissions-as-product-rules, state transitions, validation of domain data, anything that changes observable behaviour for users or money
- architecture: new modules/layers/boundaries, changed data flow, new patterns, moved responsibilities, public API/contract changes
- data: schema or migration changes, data backfills, destructive operations, changed persistence or serialization formats
- secrets: credentials, keys, tokens, env/config holding secrets, anything that could leak them (logs, client bundles)
- third-party: new or changed calls to external services/APIs/SDKs, webhooks, new network hosts, new dependencies
- security: authn/authz, input trust boundaries, crypto, CORS, injection surfaces
- infra: deploy, CI, containers, runtime config, feature flags affecting production
- suspicious: whatever looks like a mistake, in any file: values inconsistent with their neighbours or with other files in the diff (an id, number, date or name that contradicts the pattern around it), copy-paste leftovers, a renamed or removed thing still referenced, a condition or sign flipped. Check every changed value against its context before calling a file routine.
- unrequested: only when the prompt lists what the developer asked for in this session. A change in one of the files the agent edited in this session that none of those requests asked for or clearly needs: an unrelated file touched, a behaviour changed beyond the task, a new dependency, a refactor or rename nobody asked for, code deleted outside the task. Not unrequested: what the requested change needs to work (imports, types, call sites, tests and docs of the requested code). Judge against the requests as a whole: later requests may widen or change earlier ones. In "why", say which request it goes beyond. A change that fits another category and is also unrequested gets the other category, with "not requested" said in "why".
Everything else (renames, formatting, tests, UI copy, styling, refactors with no behaviour change, docs) is "pr": fine to review in the pull request.
Be strict: a critical list longer than ~7 items is noise; merge related changes into one finding.
Answer ONLY a JSON object, no prose, no code fences:
{"summary":"<2 sentences in ${languageName}: what the change does overall>","findings":[{"severity":"critical"|"pr","category":"<one of the categories above, or 'routine' for pr>","file":"<path>","line":<new-file line number or omit>,"title":"<short, ${languageName}>","why":"<one sentence in ${languageName}: what to check and the risk>"}]}`
}

// The diff to review, preceded by what else changed so the summary covers the whole branch.
export function buildReviewPrompt(input: ReviewPromptInput): { prompt: string; isTruncated: boolean } {
  const isTruncated = input.diff.length > input.maxDiffChars
  const contextLines: string[] = []

  if (input.part) {
    contextLines.push(
      `This is part ${input.part.index} of ${input.part.count} of the review: report findings only for the files in the diff below, but write the summary about the whole branch.`,
    )
  }
  if (input.otherPartFiles.length > 0) {
    contextLines.push(`Also changed, reviewed in another part (do not report): ${input.otherPartFiles.join(', ')}`)
  }
  if (input.lockfiles.length > 0) {
    contextLines.push(`Lockfiles changed (contents omitted): ${input.lockfiles.join(', ')}`)
  }
  if (input.routineFiles.length > 0) {
    contextLines.push(`Also changed, triaged as routine (do not report): ${input.routineFiles.join(', ')}`)
  }
  if (input.unchangedFiles.length > 0) {
    contextLines.push(
      `Also changed, reviewed earlier and unchanged since (do not report again, but cover them in the summary): ${input.unchangedFiles.join(', ')}`,
    )
    for (const finding of input.earlierCriticalFindings) {
      contextLines.push(`  earlier finding: ${finding.file}: ${finding.title}`)
    }
  }
  if (input.sessionIntent) {
    contextLines.push(...describeSessionIntent(input.sessionIntent))
  }
  if (isTruncated) {
    contextLines.push(`NOTE: diff truncated to the first ${input.maxDiffChars} characters.`)
  }

  const prompt = [...contextLines, '', input.diff.slice(0, input.maxDiffChars)].join('\n')
  return { prompt, isTruncated }
}

// Throws when the answer holds no JSON object: the analysis then reports an error.
export function parseReviewAnswer(answer: string): ReviewAnswer {
  const parsed = JSON.parse(extractJsonObject(answer)) as { summary?: unknown; findings?: unknown }
  const rawFindings: unknown[] = Array.isArray(parsed.findings) ? parsed.findings : []

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    findings: rawFindings.filter(hasFileAndTitle).map(toFinding),
  }
}

// The requests, numbered, and the files the agent edited: what the "unrequested"
// category is judged against. Files changed by earlier work on the branch are
// not listed, so they are never called unrequested.
function describeSessionIntent(intent: SessionIntent): string[] {
  return [
    'What the developer asked for in this session, oldest first:',
    ...intent.requests.map((request, index) => `${index + 1}. ${request.replace(/\s+/g, ' ')}`),
    `Files the agent edited in this session: ${intent.editedFiles.join(', ')}`,
  ]
}

type RawFinding = {
  file: string
  title: string
  severity?: unknown
  category?: unknown
  line?: unknown
  why?: unknown
}

function hasFileAndTitle(value: unknown): value is RawFinding {
  const candidate = value as Partial<RawFinding> | null
  return typeof candidate?.file === 'string' && typeof candidate.title === 'string'
}

// Anything but an explicit "critical" is treated as a PR-level finding.
function toFinding(raw: RawFinding): Finding {
  return {
    severity: raw.severity === 'critical' ? 'critical' : 'pr',
    category: typeof raw.category === 'string' ? raw.category : 'routine',
    file: raw.file,
    line: typeof raw.line === 'number' ? raw.line : undefined,
    title: raw.title,
    why: typeof raw.why === 'string' ? raw.why : '',
  }
}
