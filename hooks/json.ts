// The text between the first `{` and the last `}`: models sometimes wrap the
// JSON they were asked for in prose or code fences.
export function extractJsonObject(text: string): string {
  return text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
}
