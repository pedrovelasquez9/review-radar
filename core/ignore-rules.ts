// Which changed files the models never read: generated files by default, plus
// whatever the repository lists in `.reviewradarignore` at its root, written in
// gitignore syntax. Rules are read in order (the defaults first) and the last
// one that matches decides, so `!yarn.lock` brings a default back.
//
// An ignored file still counts as changed: its name is passed to the models and
// the secret scan still reads it.

import type { FileDiff } from './diff'

export const IGNORE_FILE = '.reviewradarignore'

// Files no person writes: lockfiles, build output at the root, minified files,
// source maps and test snapshots. The files they come from are in the diff.
const DEFAULT_RULES = [
  '*.lock',
  '*-lock.json',
  '*-lock.yaml',
  '*-lock.yml',
  '*.lockb',
  '/dist/',
  '/coverage/',
  '*.min.js',
  '*.min.css',
  '*.map',
  '__snapshots__/',
  '*.snap',
]

export type IgnoreRule = { matches: RegExp; isNegated: boolean }

// The default rules followed by the repository's own, from the ignore file's text.
export function parseIgnoreRules(ignoreFileText: string): IgnoreRule[] {
  return [...DEFAULT_RULES, ...ignoreFileText.split(/\r?\n/)].flatMap(line => {
    const rule = parseRule(line)
    return rule ? [rule] : []
  })
}

// The files the models read, and the names of the ones they only hear about.
export function separateIgnoredFiles(
  files: FileDiff[],
  rules: readonly IgnoreRule[],
): { sourceFiles: FileDiff[]; ignoredFiles: string[] } {
  return {
    sourceFiles: files.filter(({ file }) => !isIgnored(file, rules)),
    ignoredFiles: files.filter(({ file }) => isIgnored(file, rules)).map(({ file }) => file),
  }
}

export function isIgnored(path: string, rules: readonly IgnoreRule[]): boolean {
  let ignored = false
  for (const rule of rules) {
    if (rule.matches.test(path)) ignored = !rule.isNegated
  }
  return ignored
}

// One gitignore line: blank lines and `#` comments are no rule; `!` negates;
// a `/` before the end anchors the pattern to the root; a trailing `/` matches
// folders only. A pattern that names a folder covers everything under it.
function parseRule(line: string): IgnoreRule | undefined {
  let pattern = line.trimEnd()
  if (pattern === '' || pattern.startsWith('#')) return undefined

  const isNegated = pattern.startsWith('!')
  if (isNegated) pattern = pattern.slice(1)
  if (pattern.startsWith('\\')) pattern = pattern.slice(1)

  const isFolderOnly = pattern.endsWith('/')
  if (isFolderOnly) pattern = pattern.slice(0, -1)
  const isAnchored = pattern.includes('/')
  if (pattern.startsWith('/')) pattern = pattern.slice(1)
  if (pattern === '') return undefined

  const prefix = isAnchored ? '' : '(?:.*/)?'
  const suffix = isFolderOnly ? '/.*' : '(?:/.*)?'
  return { matches: new RegExp(`^${prefix}${globToRegExpSource(pattern)}${suffix}$`), isNegated }
}

// `**` crosses folders, `*` and `?` stay inside one, `[…]` is a character class.
function globToRegExpSource(glob: string): string {
  let source = ''
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]!
    if (glob.startsWith('**/', index)) {
      source += '(?:.*/)?'
      index += 2
    } else if (glob.startsWith('**', index)) {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else if (char === '[') {
      const end = glob.indexOf(']', index + 1)
      if (end === -1) {
        source += '\\['
      } else {
        const members = glob.slice(index + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')
        source += `[${members}]`
        index = end
      }
    } else {
      source += char.replace(/[.+^${}()|\\]/g, '\\$&')
    }
  }
  return source
}
