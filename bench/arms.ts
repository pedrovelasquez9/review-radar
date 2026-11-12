// The two ways a case is reviewed, with the same model:
// - "radar": review-radar's whole analysis, as the mod runs it; what it flags
//   is its "needs your review" list (critical findings).
// - "baseline": the same model asked to review the plain diff with a short
//   prompt, as someone would without review-radar; everything it lists counts
//   as flagged.

import { analyzeBranch } from '../core/analysis'
import { extractJsonObject } from '../core/json'
import { readSettings } from '../hooks/settings'
import type { BenchCase } from './cases'
import type { CompleteWithModel } from './claude-cli'
import { createBenchEngine } from './engine'
import type { CaseRepo } from './repo'
import { readCaseDiff } from './repo'

export type Arm = 'radar' | 'baseline'

export type FlaggedFinding = { file: string; line?: number; title: string }

export type ArmResult = { flagged: FlaggedFinding[]; costUsd: number; durationMs: number; error?: string }

// Counts what each call cost, for the report.
function metered(complete: CompleteWithModel) {
  let costUsd = 0
  const call: CompleteWithModel = async request => {
    const reply = await complete(request)
    costUsd += reply.costUsd
    return reply
  }
  return { call, costUsd: () => costUsd }
}

export async function runRadar(
  benchCase: BenchCase,
  repo: CaseRepo,
  reviewModel: string,
  complete: CompleteWithModel,
): Promise<ArmResult> {
  const meter = metered(complete)
  const engine = createBenchEngine({
    directory: repo.directory,
    request: benchCase.request,
    changedFiles: repo.changedFiles,
    reviewModel,
    complete: meter.call,
  })
  const startedAt = Date.now()
  await analyzeBranch(engine, readSettings({ reviewModel }), true)
  const report = engine.currentReport()

  return {
    flagged: report.findings
      .filter(finding => finding.severity === 'critical')
      .map(({ file, line, title }) => ({ file, line, title })),
    costUsd: meter.costUsd(),
    durationMs: Date.now() - startedAt,
    error: report.status === 'error' ? report.errorMessage : undefined,
  }
}

const BASELINE_SYSTEM_PROMPT = `You are a code reviewer. Read the pull request diff and list each problem a person should check before merging it: bugs, risky or wrong behaviour, anything the change breaks. Leave out style and naming.
Answer only with JSON: {"findings":[{"file":"<path>","line":<line number in the new file, or leave it out>,"title":"<short description>"}]}`

export async function runBaseline(repo: CaseRepo, reviewModel: string, complete: CompleteWithModel): Promise<ArmResult> {
  const startedAt = Date.now()
  try {
    const reply = await complete({
      model: reviewModel,
      effort: 'high',
      system: BASELINE_SYSTEM_PROMPT,
      prompt: readCaseDiff(repo.directory),
      timeoutMs: 300_000,
    })
    return { flagged: parseFlagged(reply.text), costUsd: reply.costUsd, durationMs: Date.now() - startedAt }
  } catch (error) {
    return { flagged: [], costUsd: 0, durationMs: Date.now() - startedAt, error: String(error) }
  }
}

function parseFlagged(text: string): FlaggedFinding[] {
  const parsed = JSON.parse(extractJsonObject(text)) as { findings?: unknown }
  const findings: unknown[] = Array.isArray(parsed.findings) ? parsed.findings : []
  return findings.flatMap(raw => {
    const finding = raw as { file?: unknown; line?: unknown; title?: unknown }
    if (typeof finding.file !== 'string') return []
    return [
      {
        file: finding.file.replace(/^[ab]\//, ''),
        line: typeof finding.line === 'number' ? finding.line : undefined,
        title: typeof finding.title === 'string' ? finding.title : '',
      },
    ]
  })
}
