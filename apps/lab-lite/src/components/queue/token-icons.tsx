/**
 * Simple geometric SVG icons for queue tokens.
 * These are abstract symbols — they must NOT mirror in RTL.
 */

import type { TokenSymbol } from '@/lib/token-generator'

interface IconProps {
  size?: number
  className?: string
}

function Star({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ direction: 'ltr' }}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function Circle({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ direction: 'ltr' }}
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function Triangle({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ direction: 'ltr' }}
    >
      <path d="M12 2L2 22h20L12 2z" />
    </svg>
  )
}

function Square({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ direction: 'ltr' }}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  )
}

function Diamond({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ direction: 'ltr' }}
    >
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
    </svg>
  )
}

function Heart({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ direction: 'ltr' }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

const TOKEN_ICON_MAP: Record<TokenSymbol, (props: IconProps) => JSX.Element> = {
  star: Star,
  circle: Circle,
  triangle: Triangle,
  square: Square,
  diamond: Diamond,
  heart: Heart,
}

export function TokenIcon({
  symbol,
  size,
  className,
}: IconProps & { symbol: TokenSymbol }) {
  const Icon = TOKEN_ICON_MAP[symbol]
  return <Icon size={size} className={className} />
}

export { Star, Circle, Triangle, Square, Diamond, Heart }
