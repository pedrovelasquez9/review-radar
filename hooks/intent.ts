// What the person asked for in this session, so the review can tell the
// changes they asked for from the ones Claude made on its own. Read from the
// session's transcript, so it survives reloads of the mod and resumed sessions.

import type { SessionMessage } from 'claude-code'

export type SessionIntent = {
  // The person's prompts in this session, oldest first.
  requests: string[]
  // Files Claude edited in this session. Absolute as the tools got them, until
  // `toRepositoryPaths` makes them relative to the repository root.
  editedFiles: string[]
}

// Only the latest requests are kept, each cut to a readable length: enough to
// know the task without sending a whole session to the model.
const MAX_REQUESTS = 30
const MAX_REQUEST_CHARS = 2_000

const FILE_EDITING_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// The person's requests and the files Claude edited, from the main conversation.
// Subagents' edits are not in it, so they are not judged against the requests.
export function readIntentFromTranscript(messages: readonly SessionMessage[]): SessionIntent {
  const requests = messages.filter(isPersonRequest).map(message => shorten(message.text.trim()))

  const editedFiles = messages
    .flatMap(message => (message.role === 'assistant' ? message.toolUses : []))
    .filter(toolUse => FILE_EDITING_TOOLS.has(toolUse.tool) && toolUse.isError !== true)
    .map(toolUse => toolUse.input.file_path ?? toolUse.input.notebook_path)
    .filter((path): path is string => typeof path === 'string')

  return {
    requests: requests.slice(-MAX_REQUESTS),
    editedFiles: [...new Set(editedFiles)],
  }
}

// Absolute paths as the diff names them: relative to the repository root, with
// forward slashes. Paths outside the repository are dropped. Compared without
// case, as Windows paths are.
export function toRepositoryPaths(absolutePaths: readonly string[], repositoryRoot: string): string[] {
  const root = normalizePath(repositoryRoot).replace(/\/$/, '') + '/'

  return absolutePaths
    .map(normalizePath)
    .filter(path => path.toLowerCase().startsWith(root.toLowerCase()))
    .map(path => path.slice(root.length))
}

// The intent is only useful when there is both something asked and something edited.
export function hasIntent(intent: SessionIntent): boolean {
  return intent.requests.length > 0 && intent.editedFiles.length > 0
}

// A message the person wrote. Left out: tool results (they come back as user
// messages), slash commands, and text the engine wraps in tags (notifications,
// command output), which describe no task.
function isPersonRequest(message: SessionMessage): boolean {
  const text = message.text.trim()
  const isToolResult = (message.toolResults?.length ?? 0) > 0
  return message.role === 'user' && !isToolResult && text !== '' && !text.startsWith('/') && !text.startsWith('<')
}

function shorten(text: string): string {
  return text.length > MAX_REQUEST_CHARS ? `${text.slice(0, MAX_REQUEST_CHARS)}…` : text
}

// Git on Windows prints `C:/Users/...`; tools may hand `C:\Users\...` or `/c/Users/...`.
function normalizePath(path: string): string {
  const forwardSlashes = path.replace(/\\/g, '/')
  const gitBashDrive = /^\/([a-zA-Z])\//.exec(forwardSlashes)
  return gitBashDrive ? `${gitBashDrive[1]}:/${forwardSlashes.slice(3)}` : forwardSlashes
}
