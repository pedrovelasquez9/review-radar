// Stage 1 of the analysis, for changes too large for one deep review: a small
// fast model sorts the changed files into "inspect" (goes to the deep review) or
// "routine" (goes to the PR list). It never writes findings, and it cannot clear
// data/config files or files with a logic change (see logic-change.ts).

import type { FileDiff } from './diff'
import { extractJsonObject } from './json'

// Changed lines shown per file: enough to tell what kind of change it is.
const MAX_LINES_PER_FILE = 60

export type TriageResult = {
  filesToInspect: Set<string>
  // A short title the model gave each file, used for routine files in the PR list.
  titlesByFile: Map<string, string>
}

export function triageSystemPrompt(languageName: string): string {
  return `You triage a code diff, file by file, judging what each change DOES, never the framework or language.
Answer "inspect" when a file's change may touch business logic, architecture or public contracts, data/schema/migrations, secrets or config holding them, external services/new dependencies, security (auth, trust boundaries, crypto), or infra/deploy/CI.
Answer "routine" for formatting, renames, tests, docs, styling, UI copy, and refactors with no behaviour change. When unsure, answer "inspect".
Answer ONLY JSON, no prose: {"files":[{"file":"<path>","verdict":"inspect"|"routine","note":"<short ${languageName} title of the change>"}]}`
}

// Only the changed lines of each file, capped, under a `### path` heading.
export function buildTriagePrompt(files: FileDiff[]): string {
  return files.map(describeFileForTriage).join('\n\n')
}

// Data and config look routine to a triage and are exactly where a swapped value
// hides, so they always get the deep review. Recognized by path, not by stack.
export function mustAlwaysInspect(file: string): boolean {
  const isDataOrConfigFolder =
    /(^|\/)(data|config|configs|settings|migrations?|schemas?|seeds?|fixtures?|db|database|infra|deploy|\.github)(\/|$)/i
  const isDataOrConfigExtension = /\.(json|ya?ml|toml|ini|env|sql|xml|properties|conf|cfg|tf|prisma|graphql|proto)$/i
  const isEnvOrBuildFile = /(^|\/)(\.env[^/]*|dockerfile|docker-compose[^/]*|makefile)$/i

  return isDataOrConfigFolder.test(file) || isDataOrConfigExtension.test(file) || isEnvOrBuildFile.test(file)
}

// A file the model skipped, mislabeled, or an unreadable answer goes to
// "inspect": missing a critical change costs more than reviewing a routine one.
export function parseTriageAnswer(answer: string, files: FileDiff[]): TriageResult {
  const routineFiles = new Set<string>()
  const titlesByFile = new Map<string, string>()

  try {
    const parsed = JSON.parse(extractJsonObject(answer)) as {
      files?: { file?: unknown; verdict?: unknown; note?: unknown }[]
    }
    for (const entry of parsed.files ?? []) {
      if (typeof entry.file !== 'string') continue
      if (entry.verdict === 'routine') routineFiles.add(entry.file)
      if (typeof entry.note === 'string') titlesByFile.set(entry.file, entry.note)
    }
  } catch {
    // Unreadable answer: no file is cleared.
  }

  const filesToInspect = new Set(files.map(({ file }) => file).filter(file => !routineFiles.has(file)))
  return { filesToInspect, titlesByFile }
}

function describeFileForTriage({ file, diffText }: FileDiff): string {
  const changedLines = diffText.split('\n').filter(line => isAddedOrRemovedLine(line))
  const shownLines = changedLines.slice(0, MAX_LINES_PER_FILE)
  const hiddenCount = changedLines.length - shownLines.length
  const hiddenNote = hiddenCount > 0 ? `\n… ${hiddenCount} more lines` : ''

  return `### ${file}\n${shownLines.join('\n')}${hiddenNote}`
}

function isAddedOrRemovedLine(line: string): boolean {
  const isFileHeader = line.startsWith('+++ ') || line.startsWith('--- ')
  return !isFileHeader && (line.startsWith('+') || line.startsWith('-'))
}
