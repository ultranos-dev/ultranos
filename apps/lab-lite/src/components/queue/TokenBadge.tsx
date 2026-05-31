'use client'

import type { TokenColor, TokenSymbol } from '@/lib/token-generator'
import { TokenIcon } from './token-icons'

/**
 * High-contrast, colorblind-accessible token colors.
 * Each color is distinguishable in normal, protanopia, and deuteranopia vision.
 * The symbol provides the secondary differentiator.
 */
const COLOR_MAP: Record<TokenColor, { bg: string; text: string }> = {
  red: { bg: '#DC2626', text: '#FFFFFF' },
  blue: { bg: '#2563EB', text: '#FFFFFF' },
  green: { bg: '#16A34A', text: '#FFFFFF' },
  yellow: { bg: '#EAB308', text: '#1A1A1A' },
  purple: { bg: '#9333EA', text: '#FFFFFF' },
  orange: { bg: '#EA580C', text: '#FFFFFF' },
}

const SIZE_CONFIG = {
  sm: { icon: 16, padding: 'px-2 py-1', text: 'text-xs', iconGap: 'gap-1' },
  lg: { icon: 32, padding: 'px-3 py-2', text: 'text-base', iconGap: 'gap-2' },
  xl: { icon: 64, padding: 'px-6 py-4', text: 'text-2xl', iconGap: 'gap-3' },
} as const

type BadgeSize = keyof typeof SIZE_CONFIG

interface TokenBadgeProps {
  color: TokenColor
  symbol: TokenSymbol
  size?: BadgeSize
  overflowIndex?: number
  className?: string
}

export function TokenBadge({
  color,
  symbol,
  size = 'sm',
  overflowIndex,
  className = '',
}: TokenBadgeProps) {
  const colors = COLOR_MAP[color]
  const config = SIZE_CONFIG[size]

  return (
    <span
      className={`inline-flex items-center rounded-full ${config.padding} ${config.iconGap} ${config.text} font-semibold ${className}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        direction: 'ltr', // tokens are abstract — no RTL mirroring
      }}
      role="img"
      aria-label={`${color} ${symbol}${overflowIndex ? ` ${overflowIndex}` : ''}`}
    >
      <TokenIcon symbol={symbol} size={config.icon} />
      {overflowIndex != null && (
        <span className="font-bold">{overflowIndex}</span>
      )}
    </span>
  )
}
