'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { encryptBlob } from '@/lib/consent-crypto'
import { Check, Mic, StopCircle } from '@ultranos/ui-kit/icons'

const MAX_RECORDING_DURATION_S = 120

type RecordingState = 'idle' | 'recording' | 'recorded' | 'error'

function getPreferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus'
  }
  if (MediaRecorder.isTypeSupported('audio/ogg')) {
    return 'audio/ogg'
  }
  return ''
}

export interface AudioRecorderProps {
  onRecordingComplete: (encryptedBlob: Blob) => void
}

export function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const t = useTranslations('consent')
  const [state, setState] = useState<RecordingState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rawBlobRef = useRef<Blob | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (playbackUrl) {
      URL.revokeObjectURL(playbackUrl)
    }
  }, [playbackUrl])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  const startRecording = useCallback(async () => {
    try {
      const mimeType = getPreferredMimeType()
      if (!mimeType) {
        setState('error')
        setErrorMessage(t('recording.microphoneUnavailable'))
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: mimeType })
        rawBlobRef.current = rawBlob

        // Create playback URL for preview
        const url = URL.createObjectURL(rawBlob)
        setPlaybackUrl(url)

        // Encrypt before passing to parent
        const encrypted = await encryptBlob(rawBlob)
        onRecordingComplete(encrypted)

        setState('recorded')

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      recorder.start(1000) // collect data every second
      setState('recording')
      setElapsed(0)

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1
          if (next >= MAX_RECORDING_DURATION_S) {
            recorder.stop()
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
          }
          return next
        })
      }, 1000)
    } catch (err) {
      setState('error')
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage(t('recording.microphoneDenied'))
      } else {
        setErrorMessage(t('recording.microphoneUnavailable'))
      }
    }
  }, [t, onRecordingComplete])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const reRecord = useCallback(() => {
    if (playbackUrl) {
      URL.revokeObjectURL(playbackUrl)
      setPlaybackUrl(null)
    }
    rawBlobRef.current = null
    setState('idle')
    setElapsed(0)
  }, [playbackUrl])

  if (state === 'error') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center dark:border-destructive dark:bg-destructive/20">
        <p className="text-sm text-destructive dark:text-destructive">{errorMessage}</p>
      </div>
    )
  }

  if (state === 'recorded') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 dark:bg-success/30">
          <Check size={32} className="text-success dark:text-success" />
        </div>
        <p className="text-sm font-medium">{t('recording.recorded')}</p>
        {elapsed >= MAX_RECORDING_DURATION_S && (
          <p className="text-xs text-warning dark:text-warning">{t('recording.maxDuration')}</p>
        )}
        {playbackUrl && (
          <audio controls src={playbackUrl} className="w-full max-w-xs" aria-label={t('recording.playback')}>
            <track kind="captions" />
          </audio>
        )}
        <button
          type="button"
          onClick={reRecord}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          {t('recording.reRecord')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {state === 'idle' && (
        <>
          <button
            type="button"
            onClick={startRecording}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label={t('recording.idle')}
          >
            <Mic size={32} aria-hidden="true" />
          </button>
          <p className="text-sm text-muted-foreground">{t('recording.idle')}</p>
        </>
      )}

      {state === 'recording' && (
        <>
          <button
            type="button"
            onClick={stopRecording}
            className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-destructive text-white shadow-lg"
            aria-label="Stop recording"
          >
            <StopCircle size={28} aria-hidden="true" />
          </button>
          <p className="text-sm font-medium text-destructive dark:text-destructive">
            {t('recording.recording', { elapsed })}
          </p>
          <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-destructive transition-all"
              style={{ width: `${(elapsed / MAX_RECORDING_DURATION_S) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  )
}
