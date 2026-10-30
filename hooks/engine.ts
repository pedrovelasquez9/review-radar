// What the analysis needs from Claude Code, as plain functions.
//
// Why this exists: the engine lets `$` (its interface) be used only inside the
// hooks module itself, register.tsx; it never follows `$` across an import.
// register.tsx builds this object from `$` with `createEngine`, and every other
// file receives it instead of `$`.

import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'

import type { Report } from '../types'

export type CommandResult = { exitCode: number; stdout: string }

export type Engine = {
  // Runs a program by its arguments (no shell) in the session's working directory.
  runCommand: (argv: string[], timeoutMs: number) => Promise<CommandResult>
  // A file's text, or undefined when it cannot be read.
  readTextFile: (path: string) => Promise<string | undefined>
  completeWithModel: (request: ModelCompleteRequest) => Promise<ModelCompleteResult>
  readReport: () => Promise<Report>
  updateReport: (change: (report: Report) => Report) => Promise<void>
  // The line in Claude Code's status bar; undefined clears it.
  showStatus: (text: string | undefined) => void
  showToast: (text: string) => void
}
