'use client'

import { useTranslations } from 'next-intl'
import type { TokenColor, TokenSymbol } from '@/lib/token-generator'
import { TokenBadge } from './TokenBadge'

interface TokenCardProps {
  color: TokenColor
  symbol: TokenSymbol
  overflowIndex?: number
  queuePosition: number
}

/**
 * Print-optimized card (~3" x 2") showing the token badge,
 * localized color+symbol name, and queue number.
 */
export function TokenCard({
  color,
  symbol,
  overflowIndex,
  queuePosition,
}: TokenCardProps) {
  const t = useTranslations('patientQueue.tokens')

  const colorName = t(`color.${color}`)
  const symbolName = t(`symbol.${symbol}`)
  const displayName = overflowIndex
    ? `${colorName} ${symbolName} ${overflowIndex}`
    : `${colorName} ${symbolName}`

  return (
    <div
      className="token-card flex flex-col items-center justify-center border-2 border-neutral-300 rounded-lg p-6 bg-white"
      style={{ width: '3in', height: '2in' }}
      data-testid="token-card"
    >
      <TokenBadge
        color={color}
        symbol={symbol}
        size="xl"
        overflowIndex={overflowIndex}
      />
      <p className="mt-3 text-lg font-bold text-neutral-900">{displayName}</p>
      <p className="mt-1 text-sm text-neutral-500">#{queuePosition}</p>
    </div>
  )
}

/**
 * Wrapper that triggers window.print() with only the token card visible.
 */
export function PrintTokenButton({
  onClick,
}: {
  onClick: () => void
}) {
  const t = useTranslations('patientQueue.tokens')

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      {t('printToken')}
    </button>
  )
}
