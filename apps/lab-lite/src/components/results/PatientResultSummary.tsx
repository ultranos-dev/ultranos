'use client'

/**
 * PatientResultSummary — Story 45.4 Task 5
 *
 * Patient-facing result summary for low-literacy users. Shows:
 *   - Plain-language test name + icon
 *   - Color indicator (green/yellow/red)
 *   - Audio play button (physician-approved, offline-ready)
 *   - Optional plain-text explanation (expandable)
 *
 * CRITICAL — Data minimisation (AC #4):
 *   This component MUST NOT render raw numeric values, LOINC codes,
 *   or reference ranges. The patient sees ONLY test name + color + audio.
 *
 * Story 45.4 AC: #1, #2, #3
 */

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Droplet, Heart, Activity } from '@ultranos/ui-kit/icons'
import { ResultColorIndicator } from './ResultColorIndicator'
import { AudioResultPlayer } from './AudioResultPlayer'
import type { Interpretation } from '@/lib/result-interpretation'
import { resolveAudioScript, isScriptApproved } from '@/lib/audio-result-scripts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientResult {
  /** Unique key for this result field, e.g. "cbc" */
  resultField: string
  /** LOINC category code, e.g. "58410-2" */
  testCategory: string
  /** Interpretation level (computed at authorization time — Story 42.5) */
  interpretation: Interpretation
}

export interface PatientResultSummaryProps {
  results: PatientResult[]
  /** Active locale (en / ar / prs / ps) */
  locale: string
}

// ---------------------------------------------------------------------------
// Helpers — plain-language test name lookup
// ---------------------------------------------------------------------------

const TEST_NAME_KEY_MAP: Record<string, string> = {
  '58410-2': 'cbc',
  '57698-3': 'lipidPanel',
  '4548-4': 'hba1c',
  '51990-0': 'metabolicPanel',
  '24325-3': 'liverFunction',
  '3016-3': 'tsh',
  '24356-8': 'urinalysis',
  '1558-6': 'fastingGlucose',
}

// Test-type icon mapping
function TestIcon({ testCategory }: { testCategory: string }) {
  // Blood drop for CBC
  if (testCategory === '58410-2') {
    return <Droplet size={24} aria-hidden="true" className="text-red-400" />
  }
  // Heart for lipid panel
  if (testCategory === '57698-3') {
    return <Heart size={24} aria-hidden="true" className="text-pink-400" />
  }
  // Activity / chart for everything else
  return <Activity size={24} aria-hidden="true" className="text-primary" />
}

// ---------------------------------------------------------------------------
// Single result card
// ---------------------------------------------------------------------------

interface ResultCardProps {
  result: PatientResult
  locale: string
  onPlayStart?: (resultField: string) => void
}

function ResultCard({ result, locale }: ResultCardProps) {
  const t = useTranslations('results.audio')
  const [expanded, setExpanded] = useState(false)

  const { testCategory, resultField, interpretation } = result
  const testNameKey = TEST_NAME_KEY_MAP[testCategory]
  const plainTestName = testNameKey ? t(`testName.${testNameKey}`) : resultField

  const interpretationLabel = t(`interpretation.${interpretation.replace('-', '')}` as Parameters<typeof t>[0])

  const script = resolveAudioScript(testCategory, resultField, interpretation)
  const fallbackText =
    script?.plainTextScripts[locale] ?? script?.plainTextScripts['en']
  const hasApprovedAudio = script !== null && isScriptApproved(script)

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Header row: icon + test name + color indicator */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-shrink-0">
          <TestIcon testCategory={testCategory} />
        </span>

        <div className="min-w-0 flex-1">
          {/* Plain-language test name only — NO LOINC codes, NO raw values */}
          <p className="text-base font-semibold text-foreground">
            {plainTestName}
          </p>
          <div className="mt-1">
            <ResultColorIndicator
              interpretation={interpretation}
              label={interpretationLabel}
            />
          </div>
        </div>
      </div>

      {/* Audio player (or fallback) */}
      <div className="mt-4">
        {hasApprovedAudio ? (
          <AudioResultPlayer
            testCategory={testCategory}
            resultField={resultField}
            interpretation={interpretation}
            locale={locale}
          />
        ) : (
          /* Fallback inline text when no approved audio */
          fallbackText ? (
            <p className="text-sm leading-relaxed text-foreground">
              {fallbackText}
            </p>
          ) : null
        )}
      </div>

      {/* Expandable plain-text explanation */}
      {fallbackText && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-sm text-primary underline hover:text-primary/80 dark:text-primary dark:hover:text-blue-200"
            aria-expanded={expanded}
          >
            {expanded ? '▲ Hide explanation' : '▼ Read explanation'}
          </button>
          {expanded && (
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {fallbackText}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PatientResultSummary({ results, locale }: PatientResultSummaryProps) {
  const t = useTranslations('results.audio')

  // Play-all: sequential playback state
  const [playAllIndex, setPlayAllIndex] = useState<number | null>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  const handlePlayAll = useCallback(() => {
    if (results.length === 0) return
    setPlayAllIndex(0)
  }, [results.length])

  // When playAll is active and an audio ends, advance to the next
  const handleCardEnded = useCallback(
    (index: number) => {
      if (playAllIndex !== index) return
      const next = index + 1
      setPlayAllIndex(next < results.length ? next : null)
    },
    [playAllIndex, results.length],
  )

  if (results.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {/* Play All button */}
      <button
        type="button"
        onClick={handlePlayAll}
        className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={t('playAll')}
        data-testid="play-all-button"
      >
        {t('playAll')}
      </button>

      {/* Result cards — one per result field */}
      <div className="flex flex-col gap-3" data-testid="result-cards">
        {results.map((result, index) => (
          <ResultCard
            key={`${result.testCategory}-${result.resultField}-${result.interpretation}`}
            result={result}
            locale={locale}
            onPlayStart={() => {
              // Register the audio element for play-all sequencing
              const audio = audioRefs.current.get(result.resultField)
              if (audio) {
                audio.onended = () => handleCardEnded(index)
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}
