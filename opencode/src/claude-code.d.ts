// types/index.d.ts (shared with the Claude Code mod) also declares the mod's
// state for Claude Code's engine. This stand-in lets that declaration compile
// here, where Claude Code's own types are not installed.

declare module 'claude-code' {
  export type Shaped<T> = T
  export interface PluginState {}
}
