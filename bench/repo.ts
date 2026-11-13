// One case as a real git repository: the base project committed on main, the
// case's changes committed on a branch, checked out. review-radar then reads it
// with real git, as it would read the person's repository.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { BenchCase } from './cases'
import type { RealCase } from './mine'
import { cloneDirectory } from './mine'
import { BASE_PROJECT } from './project'

export type CaseRepo = {
  directory: string
  // Root-relative paths the case changed: what "the agent edited".
  changedFiles: string[]
  // Where the planted defect is, as file and line in the new version.
  defectLines: { file: string; line: number }[]
}

export function createCaseRepo(benchCase: BenchCase, directory: string): CaseRepo {
  mkdirSync(directory, { recursive: true })
  writeFiles(directory, BASE_PROJECT)
  git(directory, 'init', '-q', '-b', 'main')
  git(directory, 'config', 'core.autocrlf', 'false')
  commitAll(directory, 'Shop as it is')

  git(directory, 'checkout', '-q', '-b', 'change')
  const changedFiles = new Set<string>()
  for (const edit of benchCase.edits ?? []) {
    const path = join(directory, edit.file)
    const before = readFileSync(path, 'utf8')
    if (before.split(edit.find).length !== 2) throw new Error(`${benchCase.id}: "${edit.find}" is not in ${edit.file} exactly once`)
    writeFileSync(path, before.replace(edit.find, edit.replace))
    changedFiles.add(edit.file)
  }
  writeFiles(directory, benchCase.newFiles ?? {})
  for (const file of Object.keys(benchCase.newFiles ?? {})) changedFiles.add(file)
  commitAll(directory, benchCase.request)

  const defectLines = (benchCase.defect?.places ?? []).map(({ file, marker }) => {
    const lines = readFileSync(join(directory, file), 'utf8').split('\n')
    const index = lines.findIndex(line => line.includes(marker))
    if (index === -1) throw new Error(`${benchCase.id}: marker "${marker}" is not in ${file}`)
    return { file, line: index + 1 }
  })
  return { directory, changedFiles: [...changedFiles], defectLines }
}

// A mined case (mine.ts) as the real repository: main at the commit's parent,
// the commit checked out on a branch. Shares the clone's objects, so it is cheap.
export function createRealCaseRepo(realCase: RealCase, directory: string): CaseRepo {
  git(process.cwd(), 'clone', '-q', '--shared', '--no-checkout', cloneDirectory(realCase.repository), directory)
  git(directory, 'config', 'core.autocrlf', 'false')
  // Without it review-radar would diff against origin/main, which already holds the commit.
  git(directory, 'remote', 'remove', 'origin')
  // Off the clone's default branch first: git does not move the branch checked out.
  git(directory, 'checkout', '-q', '-b', 'change', realCase.commit)
  git(directory, 'branch', '-f', 'main', `${realCase.commit}^`)
  const changedFiles = git(directory, 'diff', '--name-only', '--no-renames', 'main', 'HEAD').split('\n').filter(Boolean)
  return { directory, changedFiles, defectLines: realCase.defectLines }
}

// The branch's diff against main, as a plain reviewer would be handed it.
export function readCaseDiff(directory: string): string {
  return git(directory, 'diff', '--no-color', 'main...HEAD')
}

function writeFiles(directory: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    const path = join(directory, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
}

function commitAll(directory: string, message: string): void {
  git(directory, 'add', '-A')
  git(directory, '-c', 'user.name=bench', '-c', 'user.email=bench@localhost', 'commit', '-q', '-m', message)
}

function git(directory: string, ...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`)
  return result.stdout.toString()
}
