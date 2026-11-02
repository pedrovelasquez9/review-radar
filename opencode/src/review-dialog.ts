// The review dialog: a list of the findings (to review first, then reviewed,
// then what can wait for the PR), and a detail view per finding with its
// reason and diff, from which it is marked reviewed or sent back as a fix
// request in the prompt.

import type { TuiDialogSelectOption, TuiPluginApi } from '@opencode-ai/plugin/tui'
import { useKeyboard } from '@opentui/solid'

import { buildChangeRequest } from '../../core/change-request'
import type { Messages } from '../../core/messages'
import { progressDescription, reportHeadline, reviewKeyOf } from '../../core/report-view'
import { findingLocation } from '../../core/text-report'
import type { Finding } from '../../types'
import { box, text } from './elements'
import type { Node } from './elements'
import type { ReviewStore } from './store'

// A diff excerpt longer than this is cut, with a note: the dialog does not scroll.
const MAX_DIFF_LINES = 40

type ReviewDialogInput = {
  api: TuiPluginApi
  messages: Messages
  store: ReviewStore
  isAutoAnalysisOn: boolean
  reanalyze: () => void
}

type ListChoice = { kind: 'finding'; finding: Finding } | { kind: 'reanalyze' } | { kind: 'none' }

export function openReviewList(input: ReviewDialogInput): void {
  const { api, messages, store } = input
  const report = store.report()
  const isReviewed = (finding: Finding) => store.reviewedKeys().has(reviewKeyOf(finding))

  const critical = report.findings.filter(finding => finding.severity === 'critical')
  const toReview = critical.filter(finding => !isReviewed(finding))
  const reviewed = critical.filter(isReviewed)
  const forThePr = report.findings.filter(finding => finding.severity === 'pr')

  const findingOption = (finding: Finding, category: string, mark = ''): TuiDialogSelectOption<ListChoice> => ({
    title: `${mark}[${finding.category}] ${finding.title}`,
    description: findingLocation(finding),
    category,
    value: { kind: 'finding', finding },
  })

  const statusOption: TuiDialogSelectOption<ListChoice>[] =
    report.status === 'analyzing'
      ? [{ title: progressDescription(report, messages), category: messages.summaryHeading, value: { kind: 'none' }, disabled: true }]
      : report.summary !== ''
        ? [{ title: report.summary, category: messages.summaryHeading, value: { kind: 'none' }, disabled: true }]
        : []

  const options: TuiDialogSelectOption<ListChoice>[] = [
    ...statusOption,
    ...toReview.map(finding => findingOption(finding, messages.needsReviewHeading(toReview.length))),
    ...reviewed.map(finding => findingOption(finding, messages.reviewedHeading(reviewed.length), '✓ ')),
    ...forThePr.map(finding => ({
      title: `${finding.file} — ${finding.title}`,
      category: messages.reviewInPrHeading(forThePr.length),
      value: { kind: 'none' } as const,
      disabled: true,
    })),
    { title: messages.reanalyzeButton, value: { kind: 'reanalyze' } },
  ]

  api.ui.dialog.setSize('large')
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<ListChoice>({
      title: `${messages.paneTitle} · ${reportHeadline(report, messages, input.isAutoAnalysisOn)}`,
      options,
      onSelect: ({ value }) => {
        if (value.kind === 'finding') openFindingDetail(input, value.finding)
        if (value.kind === 'reanalyze') {
          api.ui.dialog.clear()
          input.reanalyze()
        }
      },
    }),
  )
}

// One finding whole: keys r (reviewed / not reviewed), c (request changes),
// ← (back to the list); esc closes the dialog.
function openFindingDetail(input: ReviewDialogInput, finding: Finding): void {
  const { api, messages, store } = input
  const reviewKey = reviewKeyOf(finding)

  api.ui.dialog.replace(() => {
    useKeyboard(key => {
      if (key.name === 'r') store.setReviewed(reviewKey, !store.reviewedKeys().has(reviewKey))
      if (key.name === 'c') {
        api.ui.dialog.clear()
        void api.client.tui.appendPrompt({ text: buildChangeRequest(finding, messages) })
      }
      if (key.name === 'left' || key.name === 'backspace') openReviewList(input)
    })
    return drawFindingDetail(input, finding)
  })
}

function drawFindingDetail({ api, messages, store }: ReviewDialogInput, finding: Finding): Node {
  const theme = api.theme.current
  const reviewKey = reviewKeyOf(finding)

  return box({ flexDirection: 'column', gap: 1, paddingX: 2, paddingBottom: 1 }, [
    box({ flexDirection: 'column' }, [
      text(`[${finding.category}] ${finding.title}`, { isBold: true, fg: theme.text, wraps: true }),
      text(findingLocation(finding), { fg: theme.textMuted }),
    ]),
    text(finding.why, { fg: theme.text, wraps: true }),
    finding.diffExcerpt ? drawDiff(api, finding.diffExcerpt) : null,
    text(
      () =>
        [
          `r ${store.reviewedKeys().has(reviewKey) ? messages.unmarkReviewedButton : messages.markReviewedButton}`,
          `c ${messages.requestChangesButton}`,
          messages.backToListHint,
          messages.closeHint,
        ].join('   '),
      { fg: theme.textMuted },
    ),
  ])
}

// The diff excerpt with the theme's diff colors: added, removed, hunk headers.
function drawDiff(api: TuiPluginApi, diffExcerpt: string): Node {
  const theme = api.theme.current
  const lines = diffExcerpt.split('\n')
  const shown = lines.slice(0, MAX_DIFF_LINES)

  const colorOf = (line: string) =>
    line.startsWith('+') ? theme.diffAdded : line.startsWith('-') ? theme.diffRemoved : line.startsWith('@@') ? theme.diffHunkHeader : theme.diffContext

  return box({ flexDirection: 'column' }, [
    ...shown.map(line => text(line === '' ? ' ' : line, { fg: colorOf(line) })),
    lines.length > shown.length ? text(`… +${lines.length - shown.length}`, { fg: theme.textMuted }) : null,
  ])
}
