'use client'

import { useTranslations } from 'next-intl'
import { Printer } from '@ultranos/ui-kit/icons'
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
      className="token-card flex flex-col items-center justify-center border-2 border-border rounded-lg p-6 bg-card"
      style={{ width: '3in', height: '2in' }}
      data-testid="token-card"
    >
      <TokenBadge
        color={color}
        symbol={symbol}
        size="xl"
        overflowIndex={overflowIndex}
      />
      <p className="mt-3 text-lg font-bold text-foreground">{displayName}</p>
      <p className="mt-1 text-sm text-muted-foreground">#{queuePosition}</p>
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
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
    >
      <Printer size={16} aria-hidden="true" />
      {t('printToken')}
    </button>
  )
}
