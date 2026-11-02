// Calls to a model through OpenCode's own client: each question goes to a
// throwaway child session of the person's session, with every tool turned off
// and every permission denied, so the model can only answer. The child session
// is deleted afterwards and never shows in the session list.

import type { TuiPluginApi } from '@opencode-ai/plugin/tui'

import type { ModelRef } from './settings'

type Client = TuiPluginApi['client']

const CHILD_SESSION_TITLE = 'review-radar'
const DENY_EVERYTHING = [{ permission: '*', pattern: '*', action: 'deny' as const }]

export async function askModel(
  client: Client,
  parentSessionID: string,
  model: ModelRef,
  systemPrompt: string,
  prompt: string,
): Promise<string> {
  const created = await client.session.create(
    { parentID: parentSessionID, title: CHILD_SESSION_TITLE, permission: DENY_EVERYTHING },
    { throwOnError: true },
  )
  const sessionID = created.data.id

  try {
    const answer = await client.session.prompt(
      {
        sessionID,
        model,
        system: systemPrompt,
        tools: { '*': false },
        parts: [{ type: 'text', text: prompt }],
      },
      { throwOnError: true },
    )
    const text = answer.data.parts
      .map(part => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim()
    if (text === '') throw new Error(answer.data.info.error ? JSON.stringify(answer.data.info.error) : 'empty answer')
    return text
  } finally {
    await client.session.delete({ sessionID }).catch(() => undefined)
  }
}
