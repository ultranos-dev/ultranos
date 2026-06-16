/** Merge a (possibly array) RN style prop into a single object for assertions. */
export function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style
      .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
      .reduce((acc, s) => ({ ...acc, ...(s as object) }), {} as Record<string, unknown>)
  }
  if (style && typeof style === 'object') return style as Record<string, unknown>
  return {}
}
