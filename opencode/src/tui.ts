// Entry point of the OpenCode TUI plugin: analyzes the branch when the agent
// finishes a turn, and shows the review in the sidebar and in a dialog that
// /review-radar opens.

import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from '@opencode-ai/plugin/tui'

import { queueAnalysis } from '../../core/analysis'
import { messagesFor } from '../../core/messages'
import { reviewBudgetForContext } from '../../core/settings'
import { createOpenCodeEngine, findContextTokens, findReviewModel } from './engine'
import { openReviewList } from './review-dialog'
import { formatModelRef, readSettings } from './settings'
import { drawSidebar } from './sidebar'
import { createReviewStore } from './store'

const PLUGIN_ID = 'review-radar'
const COMMAND_NAME = 'review-radar'
// Below OpenCode's own sidebar sections.
const SIDEBAR_ORDER = 300

const tui: TuiPlugin = async (api, options) => {
  const settings = readSettings(options)
  const messages = messagesFor(settings.language)
  const directory = api.state.path.directory
  const store = createReviewStore(api.kv, directory)

  const engineFor = (sessionID: string) => createOpenCodeEngine({ api, settings, store, directory, sessionID })
  // The settings for one analysis: the review model named as it will be asked,
  // for the loader and the summary, and how much diff it reads in one call.
  const settingsFor = (sessionID: string) => {
    const model = findReviewModel(api, settings, sessionID)
    if (model === undefined) return settings
    return {
      ...settings,
      reviewModel: formatModelRef(model),
      reviewBudgetChars: reviewBudgetForContext(findContextTokens(api, model)),
    }
  }
  const analyze = (sessionID: string, isForced: boolean) =>
    queueAnalysis(engineFor(sessionID), settingsFor(sessionID), isForced)
  const reanalyze = () => {
    const sessionID = currentSessionID(api)
    if (sessionID !== undefined) void analyze(sessionID, true)
  }
  const openReview = () => openReviewList({ api, messages, store, isAutoAnalysisOn: settings.isAutoAnalysisOn, reanalyze })

  // The agent finished a turn in one of the person's sessions (not one of the
  // child sessions the review itself asks models in). An unchanged branch stops
  // at the diff hash, after a few git commands.
  const stopListening = api.event.on('session.idle', event => {
    const sessionID = event.properties.sessionID
    const isChildSession = api.state.session.get(sessionID)?.parentID !== undefined
    if (settings.isAutoAnalysisOn && !isChildSession) void analyze(sessionID, false)
  })

  const stopCommand = api.command?.register(() => [
    {
      title: messages.commandTitle,
      value: 'review-radar.open',
      category: 'Plugin',
      slash: { name: COMMAND_NAME },
      onSelect: () => {
        store.reveal()
        openReview()
        // Before the first analysis there is nothing to show: run one now.
        const sessionID = currentSessionID(api)
        if (store.report().analyzedAt === 0 && sessionID !== undefined) {
          void analyze(sessionID, true).then(openReview)
        }
      },
    },
  ])

  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: { sidebar_content: () => drawSidebar({ api, messages, store, openReview }) as never },
  })

  api.lifecycle.onDispose(() => {
    stopListening()
    stopCommand?.()
  })
}

// The session on screen, when one is.
function currentSessionID(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  return route.name === 'session' && typeof route.params?.sessionID === 'string' ? route.params.sessionID : undefined
}

const plugin: TuiPluginModule & { id: string } = { id: PLUGIN_ID, tui }

export default plugin
