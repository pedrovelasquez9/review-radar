// Code outside the diff that the change depends on, found with git grep and no
// model: where the names the diff defines or removes are used (a switch over a
// type that gained a case, a file reading a config key that was renamed), and
// where the functions its added lines call are defined (their parameters, their
// units). The review model gets it next to the diff, within a budget.

import { changedLinePositions } from './diff'
import type { FileDiff } from './diff'
import type { Engine } from './engine'
import { fromWorkingDirectory, runGit } from './git'

// Lines shown around each place found: the line itself, a little before, and
// enough after to cover a short function or a switch.
const LINES_BEFORE = 2
const LINES_AFTER = 15
// The most a review prompt spends on related code.
export const MAX_RELATED_CODE_CHARS = 16_000
const MAX_PLACES_PER_NAME = 3
// Matches read per name before the ones inside the diff are left out.
const MAX_MATCHES_PER_NAME = 30
// The plain diff shows this many unchanged lines around each change.
const DIFF_CONTEXT_LINES = 3
const MAX_NAMES = 12
const MIN_NAME_LENGTH = 3

// A top-level declaration on a changed line (no indentation: what other code can
// use, not a local variable): function, class, type, interface, enum or a
// constant/variable, in the common syntaxes.
const DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|def|fn|func)\s+([A-Za-z_$][\w$]*)/
// Prose: the project docs already reach the model on their own.
const PROSE_FILE = /\.(md|mdx|txt|rst|adoc)$/i
// A key on a changed line of a config or data file ("key": / key:).
const CONFIG_KEY = /^\s*"?([A-Za-z_][\w-]*)"?\s*:/
const CONFIG_FILE = /\.(json|ya?ml|toml|ini|env|properties)$/i
// A call on an added line, not a method of something else (`x.y(` is left out).
const CALL = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g
// Names a call can have that are not the project's own functions.
const NOT_PROJECT_FUNCTIONS = new Set(
  'if for while switch catch function return typeof new await async import require super this print len range str int float list dict set map fetch parseInt parseFloat setTimeout setInterval clearTimeout String Number Boolean Object Array Promise Error Date Math JSON Symbol BigInt RegExp Map Set'.split(
    ' ',
  ),
)

type Place = { file: string; line: number; name: string; isUsage: boolean }

export type LineRange = { file: string; first: number; last: number }

export type RelatedCode = {
  // `### file (name)` excerpts for the prompt; '' when there are none.
  text: string
  // The excerpts that use a name the diff changed: code outside the diff the
  // branch can break. A finding there is caused by the branch (finding-rules.ts).
  affectedRanges: LineRange[]
}

export const NO_RELATED_CODE: RelatedCode = { text: '', affectedRanges: [] }

export async function readRelatedCode(engine: Engine, files: FileDiff[], maxChars: number): Promise<RelatedCode> {
  const prefix = await runGit(engine, ['rev-parse', '--show-prefix'])
  if (prefix === undefined || files.length === 0) return NO_RELATED_CODE

  const { changedNames, calledNames } = namesInDiff(files)
  const changedLinesByFile = new Map(files.map(({ file, diffText }) => [file, changedLinePositions(diffText)]))
  // A place at a change is already in front of the model, with the diff's context lines.
  const isInDiff = ({ file, line }: Place) =>
    (changedLinesByFile.get(file) ?? []).some(changed => Math.abs(changed - line) <= DIFF_CONTEXT_LINES)
  const worthShowing = (found: Place[]) =>
    found.filter(place => !isInDiff(place) && !PROSE_FILE.test(place.file)).slice(0, MAX_PLACES_PER_NAME)

  const places: Place[] = []
  for (const name of changedNames) places.push(...worthShowing(await findUsages(engine, name)))
  for (const name of calledNames) places.push(...worthShowing(await findDefinitions(engine, name)))

  const sections: string[] = []
  let usedChars = 0
  const fileCache = new Map<string, string[] | undefined>()
  // The lines already shown per file: a place inside one is not shown twice.
  const shownRanges: LineRange[] = []
  const affectedRanges: LineRange[] = []
  for (const place of places) {
    const isShown = shownRanges.some(range => range.file === place.file && place.line >= range.first && place.line <= range.last)
    if (isShown) continue
    if (!fileCache.has(place.file)) {
      const text = await engine.readTextFile(fromWorkingDirectory(place.file, prefix))
      fileCache.set(place.file, text?.split('\n'))
    }
    const lines = fileCache.get(place.file)
    if (lines === undefined) continue

    const first = Math.max(1, place.line - LINES_BEFORE)
    const last = Math.min(lines.length, place.line + LINES_AFTER)
    const excerpt = lines
      .slice(first - 1, last)
      .map((text, index) => `${first + index}: ${text}`)
      .join('\n')
    const section = `### ${place.file} (${place.name})\n${excerpt}`
    if (usedChars + section.length > maxChars) break
    sections.push(section)
    shownRanges.push({ file: place.file, first, last })
    if (place.isUsage) affectedRanges.push({ file: place.file, first, last })
    usedChars += section.length
  }
  return { text: sections.join('\n\n'), affectedRanges }
}

// The names the diff defines, changes or removes (declarations, and keys in
// config files), and the functions its added lines call.
export function namesInDiff(files: FileDiff[]): { changedNames: string[]; calledNames: string[] } {
  const changed = new Set<string>()
  const called = new Set<string>()

  for (const { file, diffText } of files) {
    for (const line of diffText.split('\n')) {
      const isFileHeader = line.startsWith('+++ ') || line.startsWith('--- ')
      if (isFileHeader || !(line.startsWith('+') || line.startsWith('-'))) continue
      const code = line.slice(1)

      const declared = DECLARATION.exec(code)?.[1]
      if (declared) changed.add(declared)
      const configKey = CONFIG_FILE.test(file) ? CONFIG_KEY.exec(code)?.[1] : undefined
      if (configKey) changed.add(configKey)
      if (line.startsWith('+')) for (const [, name] of code.matchAll(CALL)) called.add(name!)
    }
  }

  const isWorthSearching = (name: string) => name.length >= MIN_NAME_LENGTH && !NOT_PROJECT_FUNCTIONS.has(name)
  const changedNames = [...changed].filter(isWorthSearching).slice(0, MAX_NAMES)
  const calledNames = [...called].filter(name => isWorthSearching(name) && !changed.has(name)).slice(0, MAX_NAMES)
  return { changedNames, calledNames }
}

async function findUsages(engine: Engine, name: string): Promise<Place[]> {
  return grep(engine, name, true, ['-w', '-F', '-e', name])
}

async function findDefinitions(engine: Engine, name: string): Promise<Place[]> {
  const declaration = `(function|def|fn|func|const|let|var|class)[[:space:]]+${name}([^A-Za-z0-9_$]|$)`
  return grep(engine, name, false, ['-E', '-e', declaration])
}

// Matches in tracked and untracked files (not ignored ones), as root-relative places.
async function grep(engine: Engine, name: string, isUsage: boolean, patternArgs: string[]): Promise<Place[]> {
  const output = await runGit(engine, ['grep', '--untracked', '--full-name', '-n', '-I', ...patternArgs, '--', ':/'])
  if (output === undefined) return []

  const places: Place[] = []
  for (const row of output.split('\n')) {
    const match = /^(.+?):(\d+):/.exec(row)
    if (match) places.push({ file: match[1]!, line: Number(match[2]), name, isUsage })
    if (places.length === MAX_MATCHES_PER_NAME) break
  }
  return places
}
