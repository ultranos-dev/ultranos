'use client'

import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { Users, Microscope, FlaskConical, CheckCircle2 } from '@ultranos/ui-kit/icons'
import type { RAGDimension, RAGStatus } from '@/lib/rag-service'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RAGDimensionCardProps {
  dimension: RAGDimension
  status: RAGStatus
  summary: string
  /** When provided, the card renders as an interactive button; omit for read-only display. */
  onClick?: () => void
  /** Wall display mode: full saturation backgrounds, white text, larger fonts. */
  wallDisplay?: boolean
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const CARD_BG: Record<RAGStatus, string> = {
  GREEN: 'bg-green-50 border-green-200',
  AMBER: 'bg-amber-50 border-amber-300',
  RED: 'bg-red-50 border-red-300',
}

const CARD_BG_WALL: Record<RAGStatus, string> = {
  GREEN: 'bg-green-500 border-green-600',
  AMBER: 'bg-amber-500 border-amber-600',
  RED: 'bg-red-500 border-red-600',
}

const STATUS_DOT: Record<RAGStatus, string> = {
  GREEN: 'bg-green-500',
  AMBER: 'bg-amber-500',
  RED: 'bg-red-500',
}

const STATUS_DOT_WALL: Record<RAGStatus, string> = {
  GREEN: 'bg-card/70',
  AMBER: 'bg-card/70',
  RED: 'bg-card/70',
}

// ---------------------------------------------------------------------------
// Per-dimension icon
// ---------------------------------------------------------------------------

function DimensionIcon({ dimension }: { dimension: RAGDimension }) {
  switch (dimension) {
    case 'PERSONNEL':
      return <Users size={20} aria-hidden="true" />
    case 'EQUIPMENT':
      return (
        <DirectionalIcon category="medical">
          <Microscope size={20} aria-hidden="true" />
        </DirectionalIcon>
      )
    case 'SUPPLIES':
      return (
        <DirectionalIcon category="medical">
          <FlaskConical size={20} aria-hidden="true" />
        </DirectionalIcon>
      )
    case 'QC':
      return <CheckCircle2 size={20} aria-hidden="true" />
  }
}

// ---------------------------------------------------------------------------
// RAGDimensionCard
// ---------------------------------------------------------------------------

export function RAGDimensionCard({
  dimension,
  status,
  summary,
  onClick,
  wallDisplay = false,
}: RAGDimensionCardProps) {
  const t = useTranslations()

  const cardBg = wallDisplay ? CARD_BG_WALL[status] : CARD_BG[status]
  const dotClass = wallDisplay ? STATUS_DOT_WALL[status] : STATUS_DOT[status]
  const textClass = wallDisplay ? 'text-white' : ''
  const mutedTextClass = wallDisplay ? 'text-white/80' : 'text-muted-foreground'
  const dimensionNameClass = wallDisplay
    ? 'text-2xl font-bold text-white'
    : 'text-base font-bold text-foreground'
  const summaryClass = wallDisplay ? 'text-xl text-white/80' : 'text-sm text-muted-foreground'

  const dimensionLabel = t(`rag.${dimension.toLowerCase()}`)

  const content = (
    <>
      {/* Header row: icon + status dot */}
      <div className="flex items-center justify-between gap-x-3">
        <span className={mutedTextClass}>
          <DimensionIcon dimension={dimension} />
        </span>
        <span
          className={`h-4 w-4 shrink-0 rounded-full ${dotClass}`}
          aria-hidden="true"
        />
      </div>

      {/* Dimension name */}
      <p className={`mt-3 ${dimensionNameClass} ${textClass}`}>
        {dimensionLabel}
      </p>

      {/* Summary text */}
      <p className={`mt-1 ${summaryClass}`}>
        {summary}
      </p>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-lg border p-4 text-start transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${cardBg}`}
        aria-label={`${dimensionLabel}: ${status}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className={`w-full rounded-lg border p-4 ${cardBg}`}
      aria-label={`${dimensionLabel}: ${status}`}
    >
      {content}
    </div>
  )
}
