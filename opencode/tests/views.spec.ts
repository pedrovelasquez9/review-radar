import { expect, test } from 'bun:test'
import { testRender } from '@opentui/solid'

import { messagesFor } from '../../core/messages'
import { openReviewList } from '../src/review-dialog'
import { drawSidebar } from '../src/sidebar'
import { createReviewStore } from '../src/store'
import { createFakeApi, createSampleStore } from './fakes'

const messages = messagesFor('es')

test('the sidebar shows nothing until an analysis finds changes', async () => {
  const api = createFakeApi()
  const store = createReviewStore(api.kv, 'C:/work/shop')

  const screen = await testRender(() => drawSidebar({ api, messages, store, openReview: () => {} }) as never, {
    width: 40,
    height: 12,
  })
  await screen.renderOnce()

  expect(screen.captureCharFrame().trim()).toBe('')
})

test('the sidebar lists the findings still to review', async () => {
  const api = createFakeApi()
  const store = createSampleStore(api)

  const screen = await testRender(() => drawSidebar({ api, messages, store, openReview: () => {} }) as never, {
    width: 40,
    height: 12,
  })
  await screen.renderOnce()
  const frame = screen.captureCharFrame()

  expect(frame).toContain('Revisión · main')
  expect(frame).toContain('Requiere tu revisión (1)')
  expect(frame).toContain('▸ [business-logic] Nuevo descuent…')
  expect(frame).toContain('src/pricing.ts:6')
  expect(frame).toContain('Revisar en la PR (1)')

  // Marked as reviewed, it leaves the sidebar.
  store.setReviewed('discount', true)
  await screen.renderOnce()
  expect(screen.captureCharFrame()).toContain('Nada crítico detectado.')
})

test('the dialog lists the findings, and a finding opens with its diff and keys', async () => {
  const api = createFakeApi()
  const store = createSampleStore(api)
  openReviewList({ api, messages, store, isAutoAnalysisOn: true, reanalyze: () => {} })

  // The list: OpenCode's own select dialog, with one option per finding.
  const list = api.dialogContent()?.() as { options: { title: string; disabled?: boolean; value: unknown }[]; onSelect: (option: unknown) => void }
  const titles = list.options.map(option => option.title)
  expect(titles).toContain('[business-logic] Nuevo descuento del 10 %')
  expect(titles).toContain('src/greet.ts — Saludo traducido')
  expect(titles).toContain('↻ Re-analizar')

  // Choosing the finding opens its detail.
  list.onSelect(list.options.find(option => option.title.startsWith('[business-logic]')))
  const detail = api.dialogContent()!
  const screen = await testRender(() => detail() as never, { width: 80, height: 20 })
  await screen.renderOnce()
  const frame = screen.captureCharFrame()
  expect(frame).toContain('¿Un pedido de exactamente 100 también lo lleva?')
  expect(frame).toContain('+  return total > 100 ? total * 0.9 : total')
  expect(frame).toContain('r ✓ Revisado')

  // r marks it reviewed; c writes the fix request in the prompt and closes the dialog.
  screen.mockInput.pressKey('r')
  await screen.flush()
  expect(store.reviewedKeys().has('discount')).toBe(true)
  expect(screen.captureCharFrame()).toContain('r ↺ Sin revisar')

  screen.mockInput.pressKey('c')
  await screen.flush()
  expect(api.appendedPrompts[0]).toContain('Hallazgo: [business-logic] Nuevo descuento del 10 %')
  expect(api.appendedPrompts[0]).toContain('Dónde: src/pricing.ts:6')
  expect(api.dialogContent()).toBeUndefined()
})

test('the dialog offers one fix request for every finding still to review', () => {
  const api = createFakeApi()
  const store = createSampleStore(api)
  const [discount] = store.report().findings
  store.updateReport(report => ({
    ...report,
    findings: [
      ...report.findings,
      { ...discount!, file: 'src/cart.ts', line: 9, title: 'Carrito vacío', reviewKey: 'cart' },
      { ...discount!, file: 'src/tax.ts', line: 2, title: 'Redondeo del IVA', reviewKey: 'tax' },
    ],
  }))
  store.setReviewed('tax', true)
  openReviewList({ api, messages, store, isAutoAnalysisOn: true, reanalyze: () => {} })

  const list = api.dialogContent()?.() as { options: { title: string; value: unknown }[]; onSelect: (option: unknown) => void }
  const all = list.options.find(option => option.title === 'Pedir cambios de todos (2)')
  expect(all).toBeTruthy()

  list.onSelect(all)
  expect(api.appendedPrompts[0]).toContain('Corrígelos todos en una sola pasada')
  expect(api.appendedPrompts[0]).toContain('Nuevo descuento del 10 %')
  expect(api.appendedPrompts[0]).toContain('Carrito vacío')
  expect(api.appendedPrompts[0]).not.toContain('Redondeo del IVA')
  expect(api.dialogContent()).toBeUndefined()
})
