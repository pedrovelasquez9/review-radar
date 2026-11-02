// A stand-in for the parts of OpenCode's TUI plugin API the views and the
// store use, with a sample report: enough to draw them with OpenTUI's test renderer.

import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import { RGBA } from '@opentui/core'

import type { Report } from '../../types'
import { createReviewStore } from '../src/store'

export const SAMPLE_REPORT: Report = {
  status: 'ready',
  summary: 'Añade un descuento y sube la versión.',
  findings: [
    {
      severity: 'critical',
      category: 'business-logic',
      file: 'src/pricing.ts',
      line: 6,
      title: 'Nuevo descuento del 10 %',
      why: '¿Un pedido de exactamente 100 también lo lleva?',
      diffExcerpt: '@@ -3,1 +3,2 @@\n-  return total\n+  return total > 100 ? total * 0.9 : total',
      reviewKey: 'discount',
    },
    { severity: 'pr', category: 'routine', file: 'src/greet.ts', title: 'Saludo traducido', why: '' },
  ],
  baseBranch: 'main',
  diffHash: 'h',
  fileDiffHashes: {},
  language: 'es',
  analyzedAt: 1,
}

export type FakeApi = TuiPluginApi & {
  // What the last dialog.replace drew, to mount it in a test renderer.
  dialogContent: () => (() => unknown) | undefined
  appendedPrompts: string[]
}

export function createFakeApi(): FakeApi {
  const color = RGBA.fromHex('#ffffff')
  const values = new Map<string, unknown>()
  let dialogContent: (() => unknown) | undefined
  const appendedPrompts: string[] = []

  const api = {
    theme: {
      current: new Proxy({}, { get: () => color }),
    },
    kv: {
      get: (key: string, fallback?: unknown) => (values.has(key) ? values.get(key) : fallback),
      set: (key: string, value: unknown) => values.set(key, value),
      ready: true,
    },
    ui: {
      dialog: {
        replace: (render: () => unknown) => {
          dialogContent = render
        },
        clear: () => {
          dialogContent = undefined
        },
        setSize: () => {},
      },
      DialogSelect: (props: unknown) => props,
      toast: () => {},
    },
    client: {
      tui: {
        appendPrompt: async ({ text }: { text: string }) => {
          appendedPrompts.push(text)
        },
      },
    },
    dialogContent: () => dialogContent,
    appendedPrompts,
  }
  return api as unknown as FakeApi
}

// A review store holding SAMPLE_REPORT, already revealed.
export function createSampleStore(api: FakeApi) {
  const store = createReviewStore(api.kv, 'C:/work/shop')
  store.updateReport(() => SAMPLE_REPORT)
  store.reveal()
  return store
}
