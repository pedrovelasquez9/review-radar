// Reading a unified diff: splitting it by file, finding hunks, and cutting the
// excerpt the pane shows under a finding.

export type FileDiff = {
  file: string
  // The file's whole section of the diff, from its `diff --git` line on.
  diffText: string
}

// Longest excerpt drawn under a finding; a longer hunk is cut around the line.
const MAX_EXCERPT_LINES = 80

// Files no person writes: lockfiles, build output at the root, minified files,
// source maps and test snapshots. The files they come from are in the diff.
const GENERATED_FILE_PATTERN =
  /(^|\/)[^/]*(\.lock|-lock\.json|-lock\.ya?ml|\.lockb)$|^(dist|coverage)\/|\.min\.(js|css)$|\.map$|(^|\/)__snapshots__\/|\.snap$/
const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/

// Each file's text ends in exactly one newline, wherever it sat in the diff: git's
// output comes trimmed, and the last file's hash must not change because
// another file now follows it (that would send it to the models again).
export function splitDiffByFile(diff: string): FileDiff[] {
  return diff
    .split(/(?=^diff --git )/m)
    .filter(section => section.startsWith('diff --git '))
    .map(section => ({
      file: /^diff --git a\/(\S+)/.exec(section)?.[1] ?? '',
      diffText: `${section.trimEnd()}\n`,
    }))
}

// Generated files drown a diff in lines nobody wrote; the models get their names
// only. The secret scan still reads them, in the whole diff.
export function separateGeneratedFiles(files: FileDiff[]): { sourceFiles: FileDiff[]; generatedFiles: string[] } {
  return {
    sourceFiles: files.filter(({ file }) => !GENERATED_FILE_PATTERN.test(file)),
    generatedFiles: files.filter(({ file }) => GENERATED_FILE_PATTERN.test(file)).map(({ file }) => file),
  }
}

// The hunk whose range in the new file holds `line`, if any. A line outside
// every hunk is one the model made up.
export function findHunkContainingLine(fileDiffText: string, line: number): string | undefined {
  return splitIntoHunks(fileDiffText).find(hunk => {
    const header = HUNK_HEADER_PATTERN.exec(hunk)
    const firstNewLine = Number(header?.[3] ?? 0)
    const newLineCount = Number(header?.[4] ?? 1)
    return line >= firstNewLine && line < firstNewLine + newLineCount
  })
}

// What the pane draws under a finding: the hunk holding its line, or every hunk
// of the file when no line is known.
export function excerptForFinding(fileDiffText: string, line?: number): string {
  const hunk = line === undefined ? undefined : findHunkContainingLine(fileDiffText, line)
  if (hunk !== undefined && line !== undefined) return cutHunkAroundLine(hunk, line)

  // Known limit: a plain cut at a line count; a cut hunk is drawn as plain code, still readable.
  const allHunkLines = splitIntoHunks(fileDiffText).join('').replace(/\n$/, '').split('\n')
  return allHunkLines.slice(0, MAX_EXCERPT_LINES).join('\n')
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function splitIntoHunks(fileDiffText: string): string[] {
  return fileDiffText.split(/(?=^@@ )/m).filter(part => part.startsWith('@@ '))
}

type NumberedLine = { text: string; oldLineNumber: number; newLineNumber: number }

// A long hunk cut to the lines around `line`, with its @@ header recounted so
// it still reads as a valid hunk.
function cutHunkAroundLine(hunk: string, line: number): string {
  const [header = '', ...bodyLines] = hunk.replace(/\n$/, '').split('\n')
  if (bodyLines.length < MAX_EXCERPT_LINES) return hunk.replace(/\n$/, '')

  const numberedLines = numberHunkLines(header, bodyLines)
  const targetIndex = Math.max(
    0,
    numberedLines.findIndex(numbered => numbered.newLineNumber === line && !numbered.text.startsWith('-')),
  )
  const startIndex = Math.max(
    0,
    Math.min(targetIndex - MAX_EXCERPT_LINES / 2, numberedLines.length - MAX_EXCERPT_LINES),
  )
  const window = numberedLines.slice(startIndex, startIndex + MAX_EXCERPT_LINES)

  const first = window[0] ?? { oldLineNumber: 1, newLineNumber: 1 }
  const oldLineCount = window.filter(numbered => !numbered.text.startsWith('+')).length
  const newLineCount = window.filter(numbered => !numbered.text.startsWith('-')).length
  const newHeader = `@@ -${first.oldLineNumber},${oldLineCount} +${first.newLineNumber},${newLineCount} @@`

  return [newHeader, ...window.map(numbered => numbered.text)].join('\n')
}

// Each body line with its number in the old and in the new file.
function numberHunkLines(header: string, bodyLines: string[]): NumberedLine[] {
  const parsedHeader = HUNK_HEADER_PATTERN.exec(header)
  let oldLineNumber = Number(parsedHeader?.[1] ?? 1)
  let newLineNumber = Number(parsedHeader?.[3] ?? 1)

  return bodyLines.map(text => {
    const numbered = { text, oldLineNumber, newLineNumber }
    const isAdded = text.startsWith('+')
    const isRemoved = text.startsWith('-')
    if (!isAdded) oldLineNumber++
    if (!isRemoved) newLineNumber++
    return numbered
  })
}
