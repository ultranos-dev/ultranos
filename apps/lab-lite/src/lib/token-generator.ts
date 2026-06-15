export const TOKEN_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
] as const

export const TOKEN_SYMBOLS = [
  'star',
  'circle',
  'triangle',
  'square',
  'diamond',
  'heart',
] as const

export type TokenColor = (typeof TOKEN_COLORS)[number]
export type TokenSymbol = (typeof TOKEN_SYMBOLS)[number]

export interface QueueToken {
  color: TokenColor
  symbol: TokenSymbol
  displayKey: string // e.g. "blue-star" or "blue-star-2" for overflow
  overflowIndex?: number // present only for overflow tokens
}

/**
 * Generate a random token not currently in the active set.
 * Throws if all 36 base combinations are exhausted — use
 * `generateTokenWithOverflow` for the safety-net path.
 */
export function generateToken(activeTokens: QueueToken[]): QueueToken {
  const activeKeys = new Set(activeTokens.map((t) => t.displayKey))
  const available: QueueToken[] = []

  for (const color of TOKEN_COLORS) {
    for (const symbol of TOKEN_SYMBOLS) {
      const key = `${color}-${symbol}`
      if (!activeKeys.has(key)) {
        available.push({ color, symbol, displayKey: key })
      }
    }
  }

  if (available.length === 0) {
    throw new Error(
      'All 36 token combinations are in use. Use generateTokenWithOverflow().',
    )
  }

  // Pick a random available token
  const index = Math.floor(Math.random() * available.length)
  return available[index]
}

/**
 * Remove a token from the active set, making it available for reuse.
 * Returns a new array (does not mutate the input).
 */
export function recycleToken(
  token: QueueToken,
  activeTokens: QueueToken[],
): QueueToken[] {
  return activeTokens.filter((t) => t.displayKey !== token.displayKey)
}

/**
 * Generate a token with overflow support. When all 36 base combinations
 * are exhausted, picks a random base combo and appends a numeric suffix
 * (e.g. "Blue Star 2"). This is a safety net for extremely busy labs.
 */
export function generateTokenWithOverflow(
  activeTokens: QueueToken[],
): QueueToken {
  const activeKeys = new Set(activeTokens.map((t) => t.displayKey))

  // Try base pool first
  const available: QueueToken[] = []
  for (const color of TOKEN_COLORS) {
    for (const symbol of TOKEN_SYMBOLS) {
      const key = `${color}-${symbol}`
      if (!activeKeys.has(key)) {
        available.push({ color, symbol, displayKey: key })
      }
    }
  }

  if (available.length > 0) {
    const index = Math.floor(Math.random() * available.length)
    return available[index]
  }

  // Overflow: pick a random color+symbol and find the next available suffix
  const color = TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)]
  const symbol =
    TOKEN_SYMBOLS[Math.floor(Math.random() * TOKEN_SYMBOLS.length)]

  let suffix = 2
  while (activeKeys.has(`${color}-${symbol}-${suffix}`)) {
    suffix++
  }

  return {
    color,
    symbol,
    displayKey: `${color}-${symbol}-${suffix}`,
    overflowIndex: suffix,
  }
}

/** Extract the overflow index from a displayKey, if present. */
export function parseOverflowIndex(displayKey: string): number | undefined {
  // Base tokens: "red-star" (2 parts). Overflow: "red-star-2" (3 parts).
  const parts = displayKey.split('-')
  if (parts.length === 3) {
    const n = Number(parts[2])
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}
