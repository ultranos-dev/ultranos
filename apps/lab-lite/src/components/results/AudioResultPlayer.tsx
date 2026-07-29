'use client'

/**
 * AudioResultPlayer — Story 45.4 Task 4
 *
 * Plays a pre-recorded, physician-approved audio explanation for a specific
 * lab result field. Falls back to plain-text if audio is unavailable or the
 * script is not yet physician-approved.
 *
 * HARD RULE: Audio is NEVER AI-generated. Only physician-approved scripts play.
 *
 * Story 45.4 AC: #1, #2
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Play, Pause, RotateCcw } from '@ultranos/ui-kit/icons'
import {
  resolveAudioScript,
  isScriptApproved,
  type Interpretation,
} from '@/lib/audio-result-scripts'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AudioResultPlayerProps {
  /** LOINC category code (e.g. "58410-2") */
  testCategory: string
  /** Analyte / result field key (e.g. "cbc") */
  resultField: string
  /** Patient-facing interpretation level */
  interpretation: Interpretation
  /** Active locale (en / ar / prs / ps) */
  locale: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioResultPlayer({
  testCategory,
  resultField,
  interpretation,
  locale,
}: AudioResultPlayerProps) {
  const t = useTranslations('results.audio')
  const audioRef = useRef<HTMLAudioElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioError, setAudioError] = useState(false)

  const script = resolveAudioScript(testCategory, resultField, interpretation)
  const approved = script !== null && isScriptApproved(script)
  const audioSrc = approved ? (script!.audioFiles[locale] ?? script!.audioFiles['en']) : null
  const fallbackText =
    script?.plainTextScripts[locale] ?? script?.plainTextScripts['en'] ?? null

  // Attach audio element event listeners
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioSrc) return

    const handleTimeUpdate = () => setProgress(audio.currentTime)
    const handleDurationChange = () => {
      if (!isNaN(audio.duration)) setDuration(audio.duration)
    }
    const handleEnded = () => setIsPlaying(false)
    const handleError = () => {
      setAudioError(true)
      setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [audioSrc])

  const handlePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.play().catch(() => setAudioError(true))
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const handleReplay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => setAudioError(true))
    setIsPlaying(true)
  }, [])

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0
  const showFallback = !approved || audioError || !audioSrc

  // ---------------------------------------------------------------------------
  // Fallback: no approved audio — show plain text only
  // ---------------------------------------------------------------------------
  if (showFallback) {
    return (
      <div
        className="rounded-lg border border-border bg-muted p-4"
        role="status"
        aria-label={t('audioUnavailable')}
      >
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('audioUnavailable')}
        </p>
        {fallbackText ? (
          <p className="text-base leading-relaxed text-foreground">
            {fallbackText}
          </p>
        ) : null}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Audio player
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-3">
      {/* Hidden audio element — autoPlay is NOT set (AC #7: user must tap play) */}
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="auto"
        data-testid="audio-element"
      >
        <track kind="captions" />
      </audio>

      {/* Progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Play / Pause — minimum 48px touch target (AC #4) */}
        {!isPlaying ? (
          <button
            type="button"
            onClick={handlePlay}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={t('playExplanation')}
            data-testid="play-button"
          >
            <Play size={22} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePause}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={t('playExplanation')}
            data-testid="pause-button"
          >
            <Pause size={22} aria-hidden="true" />
          </button>
        )}

        {/* Replay button */}
        <button
          type="button"
          onClick={handleReplay}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={t('replay')}
          data-testid="replay-button"
        >
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
