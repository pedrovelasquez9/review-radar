// The bench runs review-radar's analysis outside Claude Code: these are the
// few names from the engine's types that the code it imports refers to.
declare module 'claude-code' {
  export type Shaped<T> = T
  export interface PluginState {}
  export type PluginOptions = Readonly<Record<string, string | number | boolean | readonly string[]>>
}
