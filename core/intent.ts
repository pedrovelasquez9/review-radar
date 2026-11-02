// What the person asked for in this session, so the review can tell the
// changes they asked for from the ones the agent made on its own. Each platform
// reads it from its session's conversation, so it survives reloads and resumes.

export type SessionIntent = {
  // The person's prompts in this session, oldest first.
  requests: string[]
  // Files the agent edited in this session. Absolute as the tools got them,
  // until `toRepositoryPaths` makes them relative to the repository root.
  editedFiles: string[]
}

// Only the latest requests are kept, each cut to a readable length: enough to
// know the task without sending a whole session to the model.
export const MAX_REQUESTS = 30
const MAX_REQUEST_CHARS = 2_000

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

export function shortenRequest(text: string): string {
  return text.length > MAX_REQUEST_CHARS ? `${text.slice(0, MAX_REQUEST_CHARS)}…` : text
}

// Git on Windows prints `C:/Users/...`; tools may hand `C:\Users\...` or `/c/Users/...`.
function normalizePath(path: string): string {
  const forwardSlashes = path.replace(/\\/g, '/')
  const gitBashDrive = /^\/([a-zA-Z])\//.exec(forwardSlashes)
  return gitBashDrive ? `${gitBashDrive[1]}:/${forwardSlashes.slice(3)}` : forwardSlashes
}
