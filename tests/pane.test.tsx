import { expect, test } from 'claude-code/testing'

import type { Report } from '../types'

const STORED_REPORT: Report = {
  status: 'ready',
  summary: 'Changes the price calculation.',
  findings: [
    {
      severity: 'critical',
      category: 'business-logic',
      file: 'src/price.ts',
      line: 4,
      title: 'New discount',
      why: 'Check the rounding.',
      diffExcerpt: '@@ -3,1 +3,2 @@\n const base = 10\n+const discount = 0.15',
      reviewKey: 'abc',
    },
    { severity: 'pr', category: 'routine', file: 'README.md', title: 'Docs', why: '' },
  ],
  baseBranch: 'origin/main',
  diffHash: 'h',
  fileDiffHashes: {},
  language: 'en',
  analyzedAt: 1,
}

const PANE = {
  plugin: 'review-radar',
  component: 'Pane',
  requestId: 'review-radar',
  props: {
    title: 'Review',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

// Answers the engine's state reads with `report` stored under the current shape.
function storedState(report: Report) {
  return (_: unknown, event: { key: string }) =>
    event.key === 'report'
      ? { value: { value: { shape: 'report-5', value: report }, version: 1 } }
      : { value: { value: undefined, version: 0 } }
}

test('the pane shows critical findings first, in English by default', async ($, on) => {
  on('state.get', storedState(STORED_REPORT))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Needs your review/ }))?.text).toBe('Needs your review (1)')
    expect(await ui.find({ type: 'Text', text: /New discount/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /README/ })).toBeFalsy()
    expect(await ui.find({ type: 'Code' })).toBeTruthy()
    expect((await ui.find({ key: 'reviewed-abc' }))?.text).toBe('✓ Reviewed')
    expect((await ui.find({ key: 'request-changes-abc' }))?.text).toBe('Request changes')
    await ui.unmount()
  }
})

test('the pane speaks Spanish when configured', { options: { language: 'es' } }, async ($, on) => {
  on('state.get', storedState({ ...STORED_REPORT, language: 'es' }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /Requiere tu revisión/ }))?.text).toBe('Requiere tu revisión (1)')
  expect((await ui.find({ key: 'reviewed-abc' }))?.text).toBe('✓ Revisado')
  expect((await ui.find({ key: 'request-changes-abc' }))?.text).toBe('Pedir cambios')
  await ui.unmount()
})

test('manual mode says how to run an analysis', { options: { autoAnalyze: false } }, async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /Automatic analysis is off/ })).toBeTruthy()
  await ui.unmount()
})

test('Request changes writes the whole finding into the prompt', async ($, on) => {
  on('state.get', storedState(STORED_REPORT))
  const filled: string[] = []
  on('prompt.fill', (_, event) => {
    filled.push(event.text)
    return { isFilled: true, text: event.text, cursor: event.text.length }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'request-changes-abc' })

  expect(filled.length).toBe(1)
  expect(filled[0]?.includes('Finding: [business-logic] New discount')).toBe(true)
  expect(filled[0]?.includes('Where: src/price.ts:4')).toBe(true)
  expect(filled[0]?.includes('+const discount = 0.15')).toBe(true)
  await ui.unmount()
})

test('the first analysis shows only the loader, with its current step', async ($, on) => {
  const firstAnalysis: Report = {
    ...STORED_REPORT,
    status: 'analyzing',
    summary: '',
    findings: [],
    analyzedAt: 0,
    progress: { step: 'deep-review', fileCount: 3, model: 'opus' },
  }
  on('state.get', storedState(firstAnalysis))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /Analyzing changes against origin\/main/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Deep review of 3 file\(s\) with opus/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Needs your review/ })).toBeFalsy()
  await ui.unmount()
})

test('a new analysis clears the previous results: only the loader is left', async ($, on) => {
  on('state.get', storedState({ ...STORED_REPORT, status: 'analyzing', progress: { step: 'reading-changes' } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /Reading the changes/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /New discount/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Changes the price calculation/ })).toBeFalsy()
  expect(await ui.find({ key: 'reanalyze' })).toBeFalsy()
  await ui.unmount()
})
