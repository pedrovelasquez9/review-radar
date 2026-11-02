// The session's intent (see core/intent.ts), from an OpenCode session's
// messages: what the person typed, and the files the agent's tools edited.

import { MAX_REQUESTS, shortenRequest } from '../../core/intent'
import type { SessionIntent } from '../../core/intent'

// The parts of OpenCode's message and part types this reads.
export type SessionMessage = { id: string; role: string }
export type MessagePart =
  | { type: 'text'; text: string; synthetic?: boolean; ignored?: boolean }
  | { type: 'tool'; tool: string; state: { status: string; input?: Record<string, unknown> } }
  | { type: string }

// Tools that write a file named by their `filePath` input.
const FILE_EDITING_TOOLS = new Set(['edit', 'write', 'multiedit'])
// The patch tool names its files inside the patch text.
const PATCH_TOOLS = new Set(['patch', 'apply_patch'])
const PATCH_FILE_LINE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm

export function readIntentFromSession(
  messages: readonly SessionMessage[],
  partsOf: (messageID: string) => readonly MessagePart[],
): SessionIntent {
  const requests: string[] = []
  const editedFiles = new Set<string>()

  for (const message of messages) {
    for (const part of partsOf(message.id)) {
      if (message.role === 'user' && isPersonText(part)) requests.push(shortenRequest(part.text.trim()))
      if (message.role === 'assistant') for (const file of filesEditedBy(part)) editedFiles.add(file)
    }
  }

  return { requests: requests.slice(-MAX_REQUESTS), editedFiles: [...editedFiles] }
}

// Text the person wrote: not added by OpenCode (file contents, command output)
// and not a slash command.
function isPersonText(part: MessagePart): part is { type: 'text'; text: string } {
  if (part.type !== 'text' || !('text' in part)) return false
  const text = part.text.trim()
  return text !== '' && !part.synthetic && !part.ignored && !text.startsWith('/')
}

// Files a finished tool call edited, as the tool got them (absolute paths).
function filesEditedBy(part: MessagePart): string[] {
  if (part.type !== 'tool' || !('state' in part) || part.state.status !== 'completed') return []
  const input = part.state.input ?? {}

  if (FILE_EDITING_TOOLS.has(part.tool) && typeof input.filePath === 'string') return [input.filePath]
  if (PATCH_TOOLS.has(part.tool) && typeof input.patchText === 'string') {
    return [...input.patchText.matchAll(PATCH_FILE_LINE)].map(match => match[1]!.trim())
  }
  return []
}
