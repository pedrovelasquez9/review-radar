// What the analysis needs from the coding agent it runs in, as plain functions.
//
// Each platform builds one: Claude Code in hooks/register.tsx (its engine lets
// `$` be used only there and never follows it across an import), OpenCode in
// opencode/src/engine.ts. Everything in core/ receives this instead of a platform API.

import type { Report } from '../types'
import type { SessionIntent } from './intent'

export type CommandResult = { exitCode: number; stdout: string }

// The review model's answer, and the model that gave it (which may be a fallback).
export type ReviewModelAnswer = { text: string; answeredBy: string }

export type Engine = {
  // Runs a program by its arguments (no shell) in the session's working directory.
  runCommand: (argv: string[], timeoutMs: number) => Promise<CommandResult>
  // A file's text, or undefined when it cannot be read.
  readTextFile: (path: string) => Promise<string | undefined>
  // The triage model's answer, or undefined when the call failed in any way.
  askTriageModel: (systemPrompt: string, prompt: string) => Promise<string | undefined>
  // `cachedBlocks` open the prompt and are marked for the prompt cache where the
  // platform has one: they repeat across calls. Throws when no model answered.
  askReviewModel: (systemPrompt: string, cachedBlocks: string[], prompt: string) => Promise<ReviewModelAnswer>
  readReport: () => Promise<Report>
  updateReport: (change: (report: Report) => Report) => Promise<void>
  // The person's prompts and the files the agent edited, read from this
  // session's conversation (file paths absolute, as the tools got them).
  readSessionIntent: () => Promise<SessionIntent>
  // Called when an analysis finds branch changes to review, just before its
  // loader shows: the moment the review view has something to show.
  revealPane: () => void
  // A short line on what the analysis is doing; undefined clears it.
  showStatus: (text: string | undefined) => void
  showToast: (text: string) => void
}
