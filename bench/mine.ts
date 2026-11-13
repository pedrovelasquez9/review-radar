// Mines real cases from public repositories' history, all on this machine:
//
//   bun bench/mine.ts [--since 2026-07-01] [--max-per-repo 8] owner/name ...
//
// A "fix" commit (its subject says fix or bug) that changes few lines of source
// points, through `git blame` on the lines it removed, at the commit that wrote
// them: that commit is a real bug case, its blamed lines the defect (the SZZ
// method). The fix itself, a small reviewed change, is a clean case: a proxy,
// since a fix can still be wrong.
//
// --since keeps commits after the models' training data, so they cannot have
// memorised them. Clones go to bench/.repos/, the cases to bench/real-cases.json.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

export type RealCase = {
  id: string
  kind: 'bug' | 'clean'
  repository: string
  commit: string
  // The commit's subject and body: what the developer meant to do.
  request: string
  summary: string
  // Bug cases: the blamed lines, as file and line in the commit's version.
  defectLines: { file: string; line: number }[]
}

export const REPOS_DIRECTORY = join(import.meta.dir, '.repos')
export const REAL_CASES_FILE = join(import.meta.dir, 'real-cases.json')

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const NOT_SOURCE = /(^|\/)(tests?|__tests__|spec|e2e|fixtures?|examples?|docs?|benchmarks?)\/|\.(test|spec|d)\.[cm]?[jt]sx?$/
const NOT_A_BUG_FIX = /\b(typo|docs?|readme|lint|format|ci|deps?|bump|test|release|changelog|revert)\b/i
const MAX_FIX_LINES = 20
const MAX_INTRODUCING_LINES = 400
const MAX_CHANGE_FILES = 12

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { since: { type: 'string', default: '2026-07-01' }, 'max-per-repo': { type: 'string', default: '8' } },
  })
  const cases: RealCase[] = []
  for (const repository of positionals) {
    const found = mineRepository(repository, values.since, Number(values['max-per-repo']))
    console.log(`${repository}: ${found.length / 2} bug + fix pairs`)
    cases.push(...found)
  }
  writeFileSync(REAL_CASES_FILE, `${JSON.stringify(cases, null, 2)}\n`)
  console.log(`${cases.length} cases → ${REAL_CASES_FILE}`)
}

export function cloneDirectory(repository: string): string {
  return join(REPOS_DIRECTORY, repository.replace('/', '__'))
}

function mineRepository(repository: string, since: string, maxPairs: number): RealCase[] {
  const directory = cloneDirectory(repository)
  if (!existsSync(directory)) {
    mkdirSync(REPOS_DIRECTORY, { recursive: true })
    git(REPOS_DIRECTORY, 'clone', '-q', '--no-checkout', `https://github.com/${repository}.git`, directory)
  }

  const fixes = git(directory, 'log', '--no-merges', `--since=${since}`, '-i', '-E', '--grep=\\b(fix(e[sd])?|bug)\\b', '--format=%H')
    .split('\n')
    .filter(Boolean)
  const cases: RealCase[] = []
  const usedIntroducers = new Set<string>()
  for (const fix of fixes) {
    if (cases.length >= maxPairs * 2) break
    const subject = git(directory, 'log', '-1', '--format=%s', fix).trim()
    // The subject says fix or bug, not only the body.
    if (!/\b(fix(e[sd])?|bug)\b/i.test(subject) || NOT_A_BUG_FIX.test(subject.replace(/\bfix(e[sd])?\b/gi, ''))) continue
    const fixFiles = sourceChanges(directory, fix)
    if (!fixFiles || fixFiles.lines > MAX_FIX_LINES || fixFiles.files.length > 2) continue

    const blamed = blameRemovedLines(directory, fix, fixFiles.files)
    const introducer = mostBlamed(blamed)
    if (!introducer || usedIntroducers.has(introducer)) continue
    // One parent: not the first commit, not a merge.
    if (git(directory, 'log', '-1', '--format=%P', introducer).split(' ').filter(parent => parent.trim()).length !== 1) continue
    if (git(directory, 'log', '-1', '--format=%cI', introducer) < since) continue
    const introduced = sourceChanges(directory, introducer)
    if (!introduced || introduced.lines > MAX_INTRODUCING_LINES) continue
    usedIntroducers.add(introducer)

    const name = repository.split('/')[1]
    cases.push(
      {
        id: `real-bug-${name}-${introducer.slice(0, 7)}`,
        kind: 'bug',
        repository,
        commit: introducer,
        request: message(directory, introducer),
        summary: `Fixed later by ${fix.slice(0, 7)}: ${subject}`,
        defectLines: blamed.filter(line => line.commit === introducer).map(({ file, line }) => ({ file, line })),
      },
      { id: `real-clean-${name}-${fix.slice(0, 7)}`, kind: 'clean', repository, commit: fix, request: message(directory, fix), summary: subject, defectLines: [] },
    )
  }
  return cases
}

// The commit's changed source files and lines; undefined when it changes no
// source, too many files, or files git cannot count (binary).
function sourceChanges(directory: string, commit: string): { files: string[]; lines: number } | undefined {
  const rows = git(directory, 'diff', '--numstat', '--no-renames', `${commit}^`, commit)
    .split('\n')
    .filter(Boolean)
    .map(row => row.split('\t'))
  const source = rows.filter(([, , file]) => SOURCE_FILE.test(file!) && !NOT_SOURCE.test(file!))
  if (source.length === 0 || rows.length > MAX_CHANGE_FILES || source.some(([added]) => added === '-')) return undefined
  return { files: source.map(([, , file]) => file!), lines: source.reduce((sum, [added, removed]) => sum + Number(added) + Number(removed), 0) }
}

type BlamedLine = { commit: string; file: string; line: number }

// Who wrote each non-blank line the fix removed or changed, and where it was then.
function blameRemovedLines(directory: string, fix: string, files: string[]): BlamedLine[] {
  const blamed: BlamedLine[] = []
  for (const file of files) {
    const diff = git(directory, 'diff', '-U0', '--no-renames', `${fix}^`, fix, '--', file)
    let oldLine = 0
    for (const row of diff.split('\n')) {
      const hunk = /^@@ -(\d+)/.exec(row)
      if (hunk) oldLine = Number(hunk[1])
      else if (row.startsWith('-') && !row.startsWith('---')) {
        if (row.slice(1).trim() !== '' && !/^\s*(\/\/|\*|\/\*)/.test(row.slice(1))) blamed.push(...blameLine(directory, fix, file, oldLine))
        oldLine += 1
      }
    }
  }
  return blamed
}

function blameLine(directory: string, fix: string, file: string, line: number): BlamedLine[] {
  const porcelain = git(directory, 'blame', '-w', '--porcelain', '-L', `${line},${line}`, `${fix}^`, '--', file)
  const header = /^([0-9a-f]{40}) (\d+) /.exec(porcelain)
  const filename = /^filename (.+)$/m.exec(porcelain)
  return header && filename ? [{ commit: header[1]!, file: filename[1]!, line: Number(header[2]) }] : []
}

function mostBlamed(blamed: BlamedLine[]): string | undefined {
  const counts = new Map<string, number>()
  for (const { commit } of blamed) counts.set(commit, (counts.get(commit) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function message(directory: string, commit: string): string {
  return git(directory, 'log', '-1', '--format=%B', commit).trim().slice(0, 1000)
}

function git(directory: string, ...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`)
  return result.stdout.toString()
}
