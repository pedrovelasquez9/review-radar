// Entry point: connects the engine's events to the analysis and the pane.
//
// This is the only file that may use the engine's `$`, and the only one that may
// declare the session state: the engine checks both in this file alone and never
// follows them across an import. So `createEngine` wraps what the rest of the
// code needs into plain functions (see engine.ts), and the pane is drawn from
// state read here.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { EMPTY_REPORT, analyzeBranch, queueAnalysis } from './analysis'
import type { Engine } from './engine'
import { readIntentFromTranscript } from './intent'
import { messagesFor } from './messages'
import { drawReviewPane } from './pane'
import type { PaneActions } from './pane'
import { readSettings } from './settings'
import type { Settings } from './settings'
import { formatReportAsText } from './text-report'

const COMMAND_NAME = 'review-radar'
const PANE_ID = 'review-radar'

// Session state: it survives a reload of the mod's code, and writing it redraws the pane.
// The latest analysis. Bump `shape` whenever the Report type changes: a report
// stored by an older version of the mod is then read as empty instead of misread.
const reportState = atom({ plugin: 'review-radar', key: 'report' } as const, EMPTY_REPORT, { shape: 'report-5' })
// Whether the "Review in the PR" list is unfolded.
const isPrListOpenState = atom({ plugin: 'review-radar', key: 'isPrListOpen' } as const, false)
// Review keys of the findings the person marked as reviewed.
const reviewedKeysState = atom({ plugin: 'review-radar', key: 'reviewedKeys' } as const, [])
// Tools that may change files. A turn that used none of them is not analyzed.
const FILE_CHANGING_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'])

export const register: Register = (on, options) => {
  // A change in the plugin settings reloads this module, so they are read once here.
  const settings = readSettings(options)
  const messages = messagesFor(settings.language)
  let didTurnChangeFiles = false

  on('session.start', async ($, event, next) => {
    await $.command.register({
      name: COMMAND_NAME,
      description: 'Open the review pane and re-analyze the branch changes',
    })
    const started = await next(event)

    void $.ui.open({ id: PANE_ID, title: messages.paneTitle })
    // Headless runs (-p, the SDK) and manual mode analyze only when asked.
    if (event.isInteractive && settings.isAutoAnalysisOn) void queueAnalysis(createEngine($), settings)
    return started
  })

  on('command.run', { command: COMMAND_NAME }, async $ => {
    void $.ui.open({ id: PANE_ID, title: messages.paneTitle })
    // Run directly, not through the queue: waiting on the queue would spend this
    // hook's time budget, while time spent inside engine calls (git, models) does not.
    await analyzeBranch(createEngine($), settings, true)
    return { text: formatReportAsText(await read($, reportState), messages) }
  }).catch(() => ({ text: messages.commandFailed }))

  // Only observes: if this hook ever fails, the tool call still goes through.
  on('tool.call', (_, event, next) => {
    if (FILE_CHANGING_TOOLS.has(event.tool)) didTurnChangeFiles = true
    return next(event)
  }).catch((_, event, next) => next(event))

  on('turn.complete', async ($, event, next) => {
    const completed = await next(event)

    // Subagent turns belong to the main turn; their tool calls already counted.
    const isMainTurn = event.agentId === undefined
    const shouldAnalyze = isMainTurn && !event.isAborted && didTurnChangeFiles && settings.isAutoAnalysisOn
    if (shouldAnalyze) {
      didTurnChangeFiles = false
      void queueAnalysis(createEngine($), settings)
    }
    return completed
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, event) =>
    drawReviewPane({
      ui: $.ui.resolve(event),
      messages,
      report: await read($, reportState),
      isPrListOpen: await read($, isPrListOpenState),
      reviewedKeys: new Set(await read($, reviewedKeysState)),
      isAutoAnalysisOn: settings.isAutoAnalysisOn,
      actions: createPaneActions($, settings),
    }),
  )
}

// What the analysis needs from the engine, as plain functions over `$`.
function createEngine($: EngineInterface): Engine {
  return {
    runCommand: async (argv, timeoutMs) => {
      const result = await $.process.run(argv, { timeoutMs })
      return { exitCode: result.exitCode, stdout: result.stdout }
    },
    readTextFile: path => $.fs.read(path).catch(() => undefined),
    completeWithModel: request => $.model.complete(request),
    readReport: () => read($, reportState),
    updateReport: async change => {
      await update($, reportState, change)
    },
    readSessionIntent: async () => readIntentFromTranscript(await $.session.messages()),
    showStatus: text => $.ui.status(text),
    showToast: text => $.ui.toast(text),
  }
}

// What the pane's buttons do.
function createPaneActions($: EngineInterface, settings: Settings): PaneActions {
  return {
    markReviewed: reviewKey => update($, reviewedKeysState, keys => [...keys, reviewKey]),
    unmarkReviewed: reviewKey => update($, reviewedKeysState, keys => keys.filter(key => key !== reviewKey)),
    insertInPrompt: text => $.prompt.fill({ text, mode: 'insert' }),
    togglePrList: () => update($, isPrListOpenState, wasOpen => !wasOpen),
    reanalyze: () => queueAnalysis(createEngine($), settings, true),
  }
}
