// Small builders over OpenTUI's Solid renderer, so the views read as a tree
// without a JSX build step: OpenCode loads this plugin's TypeScript as is.

import { TextAttributes } from '@opentui/core'
import type { RGBA } from '@opentui/core'
import { createElement, insert, setProp } from '@opentui/solid'

// A renderable node, as OpenTUI's Solid renderer builds them.
export type Node = ReturnType<typeof createElement>
// What a container shows: nodes, or a function Solid re-runs when the signals it reads change.
type Children = unknown | (() => unknown)

export type BoxProps = {
  flexDirection?: 'row' | 'column'
  gap?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingX?: number
  width?: number | `${number}%`
  onMouseDown?: () => void
}

export type TextProps = {
  fg?: RGBA
  isBold?: boolean
  // Long lines wrap at word boundaries instead of being cut.
  wraps?: boolean
  onMouseDown?: () => void
}

export function box(props: BoxProps, children?: Children): Node {
  const node = createElement('box')
  for (const [name, value] of Object.entries(props)) if (value !== undefined) setProp(node, name, value)
  if (children !== undefined) insert(node, children)
  return node
}

export function text(content: string | (() => string), props: TextProps = {}): Node {
  const node = createElement('text')
  if (props.fg) setProp(node, 'fg', props.fg)
  if (props.isBold) setProp(node, 'attributes', TextAttributes.BOLD)
  setProp(node, 'wrapMode', props.wraps ? 'word' : 'none')
  if (props.onMouseDown) setProp(node, 'onMouseDown', props.onMouseDown)
  insert(node, content)
  return node
}

// Cut to `maxLength` characters, with an ellipsis when something was cut.
export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}
