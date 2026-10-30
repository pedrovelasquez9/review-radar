// The review pane beside the chat: the summary, a card per critical finding with
// its diff, and the folded list of what can wait for the pull request.
//
// A pure view: register.tsx reads the state and passes it in with the actions
// the buttons run, because only register.tsx may use the engine's `$`.

import type { EngineInterface } from 'claude-code'

import type { Finding, Report } from '../types'
import type { Messages } from './messages'
import { findingLocation } from './text-report'

// The element constructors (Box, Text, Button, Code…) of the surface the pane is drawn on.
export type UiElements = ReturnType<EngineInterface['ui']['resolve']>

export type PaneActions = {
  markReviewed: (reviewKey: string) => void
  unmarkReviewed: (reviewKey: string) => void
  // Puts text in the person's prompt, at the cursor.
  insertInPrompt: (text: string) => void
  togglePrList: () => void
  reanalyze: () => void
}

export type PaneInput = {
  ui: UiElements
  messages: Messages
  report: Report
  isPrListOpen: boolean
  reviewedKeys: ReadonlySet<string>
  isAutoAnalysisOn: boolean
  actions: PaneActions
}

export function drawReviewPane(input: PaneInput) {
  const { ui, messages, report, reviewedKeys, actions } = input
  const { Box, Text, Button } = ui

  const criticalFindings = report.findings.filter(finding => finding.severity === 'critical')
  const prFindings = report.findings.filter(finding => finding.severity === 'pr')
  const hasNothingCritical = criticalFindings.length === 0 && report.status === 'ready'

  return (
    <Box flexDirection="column" gap={1}>
      <Text dimColor>{paneHeadline(input)}</Text>
      {report.summary !== '' && <Text>{report.summary}</Text>}

      <Box flexDirection="column" gap={1}>
        <Text bold color="red">
          {messages.needsReviewHeading(criticalFindings.length)}
        </Text>
        {hasNothingCritical && <Text dimColor>{messages.nothingCritical}</Text>}
        {criticalFindings.map(finding =>
          reviewedKeys.has(reviewKeyOf(finding))
            ? drawReviewedFinding(input, finding)
            : drawFindingCard(input, finding),
        )}
      </Box>

      {prFindings.length > 0 && drawPrList(input, prFindings)}

      <Button key="reanalyze" plain label={messages.reanalyzeButton} onPress={actions.reanalyze} />
    </Box>
  )
}

// Findings stored before review keys existed fall back to file, line and title.
export function reviewKeyOf(finding: Finding): string {
  return finding.reviewKey ?? `${finding.file}:${finding.line ?? ''}:${finding.title}`
}

// The dim line at the top: what the mod is doing, or the base branch once done.
function paneHeadline({ report, messages, isAutoAnalysisOn }: PaneInput): string {
  switch (report.status) {
    case 'no-repo':
      return messages.notAGitRepository
    case 'idle':
      return isAutoAnalysisOn ? messages.waitingForFirstTurn : messages.autoAnalysisOff
    case 'analyzing':
      return messages.analyzingAgainst(report.baseBranch)
    case 'error':
      return messages.analysisFailed(report.errorMessage ?? '')
    case 'ready':
      return messages.baseBranchLabel(report.baseBranch)
  }
}

// One bordered card per finding: category and title, location and reason, the
// diff excerpt, and the two actions.
function drawFindingCard({ ui, messages, actions }: PaneInput, finding: Finding) {
  const { Box, Text, Button, Code } = ui
  const reviewKey = reviewKeyOf(finding)
  const location = findingLocation(finding)
  const requestChangesText = messages.requestChangesPrompt(location, finding.title)

  return (
    <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1}>
      <Text>
        <Text bold>[{finding.category}]</Text> {finding.title}
      </Text>
      <Text dimColor>
        {location} — {finding.why}
      </Text>
      {finding.diffExcerpt && <Code source={finding.diffExcerpt} path={finding.file} format="diff" />}
      <Box flexDirection="row" gap={2}>
        <Button
          key={`reviewed-${reviewKey}`}
          variant="primary"
          label={messages.markReviewedButton}
          onPress={() => actions.markReviewed(reviewKey)}
        />
        <Button
          key={`request-changes-${reviewKey}`}
          label={messages.requestChangesButton}
          onPress={() => actions.insertInPrompt(requestChangesText)}
        />
      </Box>
    </Box>
  )
}

// A reviewed finding folds to one line; pressing it unfolds the card again.
function drawReviewedFinding({ ui, actions }: PaneInput, finding: Finding) {
  const { Button } = ui
  const reviewKey = reviewKeyOf(finding)

  return (
    <Button
      key={`unmark-${reviewKey}`}
      plain
      label={`✓ ${findingLocation(finding)} — ${finding.title}`}
      onPress={() => actions.unmarkReviewed(reviewKey)}
    />
  )
}

function drawPrList({ ui, messages, isPrListOpen, actions }: PaneInput, prFindings: Finding[]) {
  const { Box, Text, Button } = ui
  const arrow = isPrListOpen ? '▾' : '▸'

  return (
    <Box flexDirection="column">
      <Button
        key="toggle-pr-list"
        plain
        label={`${arrow} ${messages.reviewInPrHeading(prFindings.length)}`}
        onPress={actions.togglePrList}
      />
      {isPrListOpen &&
        prFindings.map(finding => (
          <Text dimColor>
            {findingLocation(finding)} — {finding.title}
          </Text>
        ))}
    </Box>
  )
}
