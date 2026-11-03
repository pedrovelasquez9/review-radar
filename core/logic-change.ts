// Deterministic floor under the triage: a file whose changed lines alter a
// decision or a computation (a condition, a comparison, boolean logic, a number)
// always gets the deep review, whatever the triage says. A flipped `>` or a new
// 0.15 is exactly what a model skimming 60 lines calls routine.
//
// Renames and reformatting are not logic changes: each line is compared by its
// shape, with identifiers and whitespace left out, so `if (total > limit)`
// becoming `if (sum > max)` matches, while `>` becoming `>=` does not.

import type { FileDiff } from './diff'

// Prose, styles, images and tests: their changes never count as logic changes.
const NON_CODE_FILE = /\.(md|mdx|markdown|txt|rst|adoc|css|scss|sass|less|svg|png|jpe?g|gif|webp|ico|lock|snap)$/i
const TEST_FILE = /(^|\/)(tests?|__tests__|specs?|e2e)\/|\.(test|spec)\.[^/]+$/i

const COMMENT_LINE = /^\s*(\/\/|#|\/\*|\*|--|<!--|;)/
const IMPORT_LINE = /^\s*(import\b|export\s+(\*|\{)|from\s+\S+\s+import\b|require\(|use\s|using\s|#include|package\s)/
const LOGIC_TOKEN =
  /\b(if|else|elif|elsif|switch|case|when|while|for|unless|guard|match|catch|throw|raise|return)\b|===?|!==?|<=|>=|&&|\|\||\?\?|\s[<>]\s|(?<![\w.])\d+(\.\d+)?(?![\w.])/

// Strings are kept (a compared value may be one), identifiers become `x`.
const SHAPE_TOKEN = /(["'`])(?:\\.|(?!\1).)*\1|[A-Za-z_$][\w$]*|\s+/g
const KEYWORDS = new Set(
  'if else elif elsif switch case when while for unless guard match catch throw raise return and or not in is true false null undefined nil None'.split(
    ' ',
  ),
)

export function hasLogicChange({ file, diffText }: FileDiff): boolean {
  if (NON_CODE_FILE.test(file) || TEST_FILE.test(file)) return false

  const removedShapes = new Map<string, number>()
  const addedShapes: string[] = []
  for (const line of diffText.split('\n')) {
    const isFileHeader = line.startsWith('+++ ') || line.startsWith('--- ')
    if (isFileHeader || !(line.startsWith('+') || line.startsWith('-'))) continue

    const code = line.slice(1)
    if (COMMENT_LINE.test(code) || IMPORT_LINE.test(code) || !LOGIC_TOKEN.test(code)) continue
    const shape = shapeOf(code)
    if (line.startsWith('-')) removedShapes.set(shape, (removedShapes.get(shape) ?? 0) + 1)
    else addedShapes.push(shape)
  }

  // Every added logic line must cancel out a removed one of the same shape.
  for (const shape of addedShapes) {
    const count = removedShapes.get(shape) ?? 0
    if (count === 0) return true
    removedShapes.set(shape, count - 1)
  }
  // A logic line removed with nothing of its shape added is a logic change too.
  return [...removedShapes.values()].some(count => count > 0)
}

function shapeOf(code: string): string {
  return code.replace(SHAPE_TOKEN, token => {
    if (/^\s+$/.test(token)) return ''
    if (/^["'`]/.test(token) || KEYWORDS.has(token)) return token
    return 'x'
  })
}
