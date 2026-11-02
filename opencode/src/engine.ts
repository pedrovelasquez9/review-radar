// The analysis's Engine (see core/engine.ts) for one OpenCode session.

import type { TuiPluginApi } from '@opencode-ai/plugin/tui'

import type { Engine } from '../../core/engine'
import { readIntentFromSession } from './intent'
import type { MessagePart, SessionMessage } from './intent'
import { askModel } from './models'
import { formatModelRef } from './settings'
import type { ModelRef, OpenCodeSettings } from './settings'
import type { ReviewStore } from './store'

type EngineInput = {
  api: TuiPluginApi
  settings: OpenCodeSettings
  store: ReviewStore
  // The project folder git runs in.
  directory: string
  // The person's session: its messages are the intent, and model calls run in
  // child sessions of it.
  sessionID: string
}

export function createOpenCodeEngine({ api, settings, store, directory, sessionID }: EngineInput): Engine {
  const reviewModel = (): ModelRef => {
    const model = findReviewModel(api, settings, sessionID)
    if (model === undefined) throw new Error('no model to review with: set "model" in the plugin options')
    return model
  }

  return {
    runCommand: (argv, timeoutMs) => runCommand(argv, directory, timeoutMs),
    readTextFile: path =>
      Bun.file(`${directory}/${path}`)
        .text()
        .catch(() => undefined),
    askTriageModel: (systemPrompt, prompt) =>
      askModel(api.client, sessionID, settings.triageModelRef ?? reviewModel(), systemPrompt, prompt).catch(
        () => undefined,
      ),
    askReviewModel: async (systemPrompt, prompt) => {
      const model = reviewModel()
      const text = await askModel(api.client, sessionID, model, systemPrompt, prompt)
      return { text, answeredBy: formatModelRef(model) }
    },
    readReport: async () => store.report(),
    updateReport: async change => store.updateReport(change),
    readSessionIntent: async () =>
      readIntentFromSession(
        api.state.session.messages(sessionID) as readonly SessionMessage[],
        messageID => api.state.part(messageID) as readonly MessagePart[],
      ),
    revealPane: () => store.reveal(),
    // The sidebar already shows the analysis's step; OpenCode has no status line for plugins.
    showStatus: () => {},
    showToast: message => api.ui.toast({ variant: 'warning', message }),
  }
}

// The review model: the one in the plugin options, else the one the session's
// agent last answered with, else OpenCode's default model.
export function findReviewModel(api: TuiPluginApi, settings: OpenCodeSettings, sessionID: string): ModelRef | undefined {
  if (settings.reviewModelRef) return settings.reviewModelRef

  const messages = api.state.session.messages(sessionID)
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.role === 'assistant') return { providerID: message.providerID, modelID: message.modelID }
  }

  const [providerID, ...modelPath] = (api.state.config.model ?? '').split('/')
  return providerID && modelPath.length > 0 ? { providerID, modelID: modelPath.join('/') } : undefined
}

// Runs a program by its arguments (no shell), killed past the timeout.
async function runCommand(argv: string[], cwd: string, timeoutMs: number) {
  const child = Bun.spawn(argv, { cwd, stdout: 'pipe', stderr: 'ignore' })
  const timer = setTimeout(() => child.kill(), timeoutMs)
  try {
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
    return { exitCode, stdout }
  } finally {
    clearTimeout(timer)
  }
}
