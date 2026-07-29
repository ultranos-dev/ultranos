'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — Samples Collected Log
// Append-only list of today's collected samples.
// Displays: sample type icon, label number, patient first name + age, timestamp.
// No edit/delete — chain-of-custody integrity (AC #5, #10).
// Data minimization: first name + age ONLY (CLAUDE.md Rule #7).
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Clock } from '@ultranos/ui-kit/icons'
import { getTodayCHWSamples } from '@/lib/db'
import type { CHWSampleCollection, CHWSampleType } from '@/types/chw-mode'

// Sample type icon colors (same palette as SampleTypeSelector)
const SAMPLE_TYPE_COLORS: Record<CHWSampleType, string> = {
  blood: 'bg-red-100 text-red-700',
  urine: 'bg-yellow-100 text-yellow-700',
  swab: 'bg-muted text-foreground',
  stool: 'bg-amber-100 text-amber-700',
  other: 'bg-primary/10 text-primary',
}

// Single-letter abbreviations for small icon badge
const SAMPLE_TYPE_ABBREV: Record<CHWSampleType, string> = {
  blood: 'B',
  urine: 'U',
  swab: 'SW',
  stool: 'ST',
  other: '?',
}

interface Props {
  onBack?: () => void
}

export function SamplesCollectedLog({ onBack }: Props) {
  const t = useTranslations('chw.log')
  const [samples, setSamples] = useState<CHWSampleCollection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const today = await getTodayCHWSamples()
      // Sort newest first
      const sorted = [...today].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))
      setSamples(sorted)
      setLoading(false)
    }
    void load()
  }, [])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header with count badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">{t('title')}</h2>
        {!loading && (
          <span className="rounded-full bg-primary px-3 py-1 text-lg font-bold text-white">
            {samples.length}
          </span>
        )}
      </div>

      {!loading && samples.length > 0 && (
        <p className="text-lg text-muted-foreground">{t('countBadge', { count: samples.length })}</p>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">…</div>
      ) : samples.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-2xl bg-muted text-xl text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('title')}>
          {samples.map((sample) => (
            <SampleRow key={sample.id} sample={sample} />
          ))}
        </ul>
      )}

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 min-h-[56px] w-full rounded-xl bg-muted px-6 py-4 text-xl font-semibold text-foreground hover:bg-muted/70"
        >
          ← Back
        </button>
      )}
    </div>
  )
}

function SampleRow({ sample }: { sample: CHWSampleCollection }) {
  const colorClass = SAMPLE_TYPE_COLORS[sample.sampleType]
  const abbrev = SAMPLE_TYPE_ABBREV[sample.sampleType]

  // Display timestamp as HH:MM only (no PHI, just time of collection)
  const timeDisplay = hlcToTimeDisplay(sample.collectedAt)

  return (
    <li className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Sample type icon badge */}
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${colorClass}`}
        aria-hidden
      >
        {abbrev}
      </div>

      <div className="min-w-0 flex-1">
        {/* Label number */}
        <p className="font-mono text-lg font-bold text-foreground">{sample.labelNumber}</p>
        {/* Patient first name + age — ONLY these two fields (CLAUDE.md Rule #7) */}
        <p className="text-base text-foreground">
          {sample.patientFirstName}
          {sample.patientAge > 0 ? `, ${sample.patientAge} yrs` : ''}
        </p>
      </div>

      {/* Timestamp */}
      <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
        <Clock size={14} aria-hidden />
        <span className="text-sm">{timeDisplay}</span>
      </div>
    </li>
  )
}

/**
 * Extract a local HH:MM display from an HLC timestamp string.
 * HLC timestamps begin with an ISO 8601 prefix.
 */
function hlcToTimeDisplay(hlcTimestamp: string): string {
  try {
    // HLC format: ISO datetime (first 24 chars) + separator + counter
    const isoPrefix = hlcTimestamp.slice(0, 24)
    const date = new Date(isoPrefix)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}
