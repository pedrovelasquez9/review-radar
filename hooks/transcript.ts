// The session's intent (see core/intent.ts), from Claude Code's transcript.

import type { SessionMessage } from 'claude-code'

import { MAX_REQUESTS, shortenRequest } from '../core/intent'
import type { SessionIntent } from '../core/intent'

const FILE_EDITING_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// The person's requests and the files Claude edited, from the main conversation.
// Subagents' edits are not in it, so they are not judged against the requests.
export function readIntentFromTranscript(messages: readonly SessionMessage[]): SessionIntent {
  const requests = messages.filter(isPersonRequest).map(message => shortenRequest(message.text.trim()))

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

// A message the person wrote. Left out: tool results (they come back as user
// messages), slash commands, and text the engine wraps in tags (notifications,
// command output), which describe no task.
function isPersonRequest(message: SessionMessage): boolean {
  const text = message.text.trim()
  const isToolResult = (message.toolResults?.length ?? 0) > 0
  return message.role === 'user' && !isToolResult && text !== '' && !text.startsWith('/') && !text.startsWith('<')
}
