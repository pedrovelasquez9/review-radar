// Reading the branch's changes from git, in the session's working directory.

import type { Engine } from './engine'

const GIT_TIMEOUT_MS = 20_000
// Untracked files are read one by one; past this many the rest are left out.
const MAX_UNTRACKED_FILES = 40
// Tried in order when the remote does not name its default branch.
const BASE_BRANCH_CANDIDATES = ['origin/main', 'origin/master', 'main', 'master']

export async function isInsideGitRepository(engine: Engine): Promise<boolean> {
  return (await runGit(engine, ['rev-parse', '--is-inside-work-tree'])) === 'true'
}

// The branch the work started from: the remote's default branch when it names
// one, else the first common name that exists, else HEAD itself.
export async function findBaseBranch(engine: Engine): Promise<string> {
  const remoteDefaultBranch = await runGit(engine, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])
  const candidates = remoteDefaultBranch ? [remoteDefaultBranch, ...BASE_BRANCH_CANDIDATES] : BASE_BRANCH_CANDIDATES

  for (const branch of candidates) {
    const exists = (await runGit(engine, ['rev-parse', '--verify', '--quiet', branch])) !== undefined
    if (exists) return branch
  }
  return 'HEAD'
}

// Everything the branch changed since it left the base: commits, uncommitted
// edits and untracked files, as one unified diff.
export async function readBranchDiff(engine: Engine, baseBranch: string): Promise<string> {
  const forkPoint = (await runGit(engine, ['merge-base', 'HEAD', baseBranch])) ?? 'HEAD'
  const trackedDiff = (await runGit(engine, ['diff', '--no-color', '--no-ext-diff', '-U3', forkPoint])) ?? ''
  const untrackedDiff = await readUntrackedFilesAsDiff(engine)

  const separator = trackedDiff && untrackedDiff ? '\n' : ''
  return trackedDiff + separator + untrackedDiff
}

// stdout of a successful git command, trimmed; undefined when it fails.
async function runGit(engine: Engine, args: string[]): Promise<string | undefined> {
  const result = await engine.runCommand(['git', ...args], GIT_TIMEOUT_MS)
  return result.exitCode === 0 ? result.stdout.trim() : undefined
}

// Untracked files do not show up in `git diff`: each is written out as a new-file diff.
async function readUntrackedFilesAsDiff(engine: Engine): Promise<string> {
  const listing = (await runGit(engine, ['ls-files', '--others', '--exclude-standard'])) ?? ''
  const paths = listing.split('\n').filter(path => path !== '').slice(0, MAX_UNTRACKED_FILES)

  const fileDiffs: string[] = []
  for (const path of paths) {
    const content = await engine.readTextFile(path)
    // A NUL character means a binary file: left out.
    const isReadableText = content !== undefined && !content.includes('\u0000')
    if (isReadableText) fileDiffs.push(newFileDiff(path, content))
  }
  return fileDiffs.join('')
}

function newFileDiff(path: string, content: string): string {
  const lines = content.split('\n')
  const header = `diff --git a/${path} b/${path}\nnew file\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n`
  const body = lines.map(line => `+${line}`).join('\n')
  return `${header}${body}\n`
}
