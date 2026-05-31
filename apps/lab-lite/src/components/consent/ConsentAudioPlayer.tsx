'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getAudioPath, type ConsentLocale } from '@/lib/consent-versions'
import { Play, Pause, RotateCcw } from '@ultranos/ui-kit/icons'

export interface ConsentAudioPlayerProps {
  locale: ConsentLocale
  onPlaybackComplete: () => void
  /** If true, show a tech override button to skip playback */
  allowTechOverride?: boolean
}

export function ConsentAudioPlayer({
  locale,
  onPlaybackComplete,
  allowTechOverride = true,
}: ConsentAudioPlayerProps) {
  const t = useTranslations('consent')
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)

  const audioPath = getAudioPath(locale)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime)
    }

    const handleDurationChange = () => {
      setDuration(audio.duration)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setHasCompleted(true)
      onPlaybackComplete()
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [onPlaybackComplete])

  const handlePlay = useCallback(() => {
    audioRef.current?.play()
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const handleRestart = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play()
    setIsPlaying(true)
    setHasCompleted(false)
  }, [])

  const handleTechOverride = useCallback(() => {
    setOverrideConfirmed(true)
    setHasCompleted(true)
    onPlaybackComplete()
  }, [onPlaybackComplete])

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0

  return (
    <div className="flex flex-col items-center gap-4">
      <audio ref={audioRef} src={audioPath} preload="auto">
        <track kind="captions" />
      </audio>

      {/* Progress bar */}
      <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!isPlaying ? (
          <button
            type="button"
            onClick={handlePlay}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
            aria-label={t('audio.play')}
          >
            <Play size={20} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePause}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
            aria-label={t('audio.pause')}
          >
            <Pause size={20} aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={handleRestart}
          className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-gray-50 dark:hover:bg-gray-800"
          aria-label={t('audio.restart')}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>

      {isPlaying && (
        <p className="text-sm text-blue-600 dark:text-blue-400">{t('audio.playing')}</p>
      )}

      {hasCompleted && (
        <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('audio.playbackComplete')}</p>
      )}

      {/* Tech override */}
      {allowTechOverride && !hasCompleted && !overrideConfirmed && (
        <div className="mt-4 border-t pt-4">
          <button
            type="button"
            onClick={handleTechOverride}
            className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('audio.techOverride')}
          </button>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {t('audio.techOverrideConfirm')}
          </p>
        </div>
      )}
    </div>
  )
}
