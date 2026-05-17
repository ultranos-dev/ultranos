/**
 * Story 24.2 Task 5: Audio playback hook for prescription TTS.
 *
 * Manages audio lifecycle: load → play → pause → complete → cleanup.
 * Audio MUST NOT be cached locally after playback (PHI requirement).
 * Supports both cloud TTS URLs and offline fragment playback.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Audio } from 'expo-av'
import type { AVPlaybackStatus } from 'expo-av'

export interface AudioPlaybackState {
  isLoading: boolean
  isPlaying: boolean
  isComplete: boolean
  progress: number // 0-1
  durationMs: number
  positionMs: number
  error: string | null
}

export interface UseAudioPlaybackReturn {
  state: AudioPlaybackState
  play: (uri: string) => Promise<void>
  playSequence: (uris: string[], gapMs?: number) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  dismiss: () => Promise<void>
}

/**
 * Hook for managing audio playback with automatic cleanup.
 *
 * @param onComplete - Called when audio reaches 100% — used for playback logging.
 */
export function useAudioPlayback(
  onComplete?: () => void,
): UseAudioPlaybackReturn {
  const soundRef = useRef<Audio.Sound | null>(null)
  const sequenceRef = useRef<{ uris: string[]; index: number; gapMs: number; cancelled: boolean } | null>(null)
  const [state, setState] = useState<AudioPlaybackState>({
    isLoading: false,
    isPlaying: false,
    isComplete: false,
    progress: 0,
    durationMs: 0,
    positionMs: 0,
    error: null,
  })

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Clean up sound on unmount — PHI: never leave audio buffered
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {})
        soundRef.current = null
      }
    }
  }, [])

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        setState((prev) => ({ ...prev, error: 'Playback error', isLoading: false }))
      }
      return
    }

    const duration = status.durationMillis ?? 0
    const position = status.positionMillis ?? 0
    const progress = duration > 0 ? position / duration : 0

    setState((prev) => ({
      ...prev,
      isPlaying: status.isPlaying,
      progress,
      durationMs: duration,
      positionMs: position,
      isLoading: false,
    }))

    if (status.didJustFinish) {
      // If in a sequence, advance to next fragment
      const seq = sequenceRef.current
      if (seq && !seq.cancelled && seq.index < seq.uris.length - 1) {
        seq.index++
        // Insert silence gap then play next fragment
        setTimeout(() => {
          if (sequenceRef.current?.cancelled) return
          playFragmentAtIndex(seq.uris[seq.index])
        }, seq.gapMs)
        return
      }

      // Final fragment or single play — mark complete
      sequenceRef.current = null
      setState((prev) => ({ ...prev, isComplete: true, isPlaying: false, progress: 1 }))
      onCompleteRef.current?.()
    }
  }, [])

  const play = useCallback(async (uri: string) => {
    // Dismiss any existing audio first
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {})
      soundRef.current = null
    }

    setState({
      isLoading: true,
      isPlaying: false,
      isComplete: false,
      progress: 0,
      durationMs: 0,
      positionMs: 0,
      error: null,
    })

    try {
      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      })

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate,
      )

      soundRef.current = sound
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Audio unavailable — please ask your doctor or pharmacist',
      }))
    }
  }, [onPlaybackStatusUpdate])

  const playFragmentAtIndex = useCallback(async (uri: string) => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {})
      soundRef.current = null
    }
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate,
      )
      soundRef.current = sound
    } catch {
      sequenceRef.current = null
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Audio unavailable — please ask your doctor or pharmacist',
      }))
    }
  }, [onPlaybackStatusUpdate])

  /**
   * Play a sequence of audio URIs with silence gaps between them.
   * Used for offline fragment stitching (AC #9).
   */
  const playSequence = useCallback(async (uris: string[], gapMs = 200) => {
    if (uris.length === 0) return

    // Cancel any existing sequence
    if (sequenceRef.current) {
      sequenceRef.current.cancelled = true
    }

    sequenceRef.current = { uris, index: 0, gapMs, cancelled: false }

    // Dismiss any existing audio first
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {})
      soundRef.current = null
    }

    setState({
      isLoading: true,
      isPlaying: false,
      isComplete: false,
      progress: 0,
      durationMs: 0,
      positionMs: 0,
      error: null,
    })

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      })

      const { sound } = await Audio.Sound.createAsync(
        { uri: uris[0] },
        { shouldPlay: true },
        onPlaybackStatusUpdate,
      )
      soundRef.current = sound
    } catch {
      sequenceRef.current = null
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Audio unavailable — please ask your doctor or pharmacist',
      }))
    }
  }, [onPlaybackStatusUpdate])

  const pause = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync().catch(() => {})
    }
  }, [])

  const resume = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.playAsync().catch(() => {})
    }
  }, [])

  const dismiss = useCallback(async () => {
    // Cancel any active sequence
    if (sequenceRef.current) {
      sequenceRef.current.cancelled = true
      sequenceRef.current = null
    }
    // PHI: clear audio buffer on dismiss — never cache locally
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {})
      soundRef.current = null
    }
    setState({
      isLoading: false,
      isPlaying: false,
      isComplete: false,
      progress: 0,
      durationMs: 0,
      positionMs: 0,
      error: null,
    })
  }, [])

  return { state, play, playSequence, pause, resume, dismiss }
}
