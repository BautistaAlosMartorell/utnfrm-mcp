/** Remove authentication material and transport diagnostics before exposing errors. */
export function sanitizeCampusErrorMessage(message: string): string {
  return message
    .replace(/\b(cookie|set-cookie|authorization)\s*:[^\r\n]*/gi, '$1: [oculto]')
    .replace(/\b(MoodleSession|MOODLEID\d*_?|sesskey|csrf|token|password)\s*(?:=|:)\s*[^&;,\s)]+/gi, '$1=[oculto]')
    .replace(/https?:\/\/[^\s)]+/gi, '[URL del Campus]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[dato oculto]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}
