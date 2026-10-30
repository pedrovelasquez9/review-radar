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
