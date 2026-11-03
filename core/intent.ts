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
const MAX_REQUESTS_TOTAL_CHARS = 16_000

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

// The first request (it usually sets the task) and the latest ones, oldest
// first, up to MAX_REQUESTS_TOTAL_CHARS: a long session is not sent whole on
// every review. The dropped middle requests are marked so the model knows.
export function keepRequestsWithinBudget(requests: string[]): string[] {
  const [first, ...rest] = requests
  if (first === undefined) return []

  const latest: string[] = []
  let usedChars = first.length
  for (let index = rest.length - 1; index >= 0; index--) {
    const request = rest[index]!
    if (usedChars + request.length > MAX_REQUESTS_TOTAL_CHARS) break
    latest.unshift(request)
    usedChars += request.length
  }
  const droppedCount = rest.length - latest.length
  return droppedCount > 0 ? [first, `(${droppedCount} earlier request(s) left out)`, ...latest] : [first, ...latest]
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
