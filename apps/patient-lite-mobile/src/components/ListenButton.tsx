/**
 * Story 24.2 Task 5: "Listen" button for prescription TTS.
 *
 * Renders a speaker icon button on each medication card.
 * On tap: requests dialect-tuned TTS from Hub API (online) or
 * stitches offline fragments (offline fallback).
 *
 * PHI safety:
 * - Audio is NEVER cached locally after playback
 * - Audio buffer cleared on dismiss
 * - Button hidden when AI_PROCESSING consent not granted
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useAudioPlayback } from '@/hooks/useAudioPlayback'
import { generatePrescriptionAudio, logPlaybackCompletion } from '@/lib/tts-api'
import { getStitchableFragments, FRAGMENT_GAP_MS } from '@/lib/tts-fragment-stitcher'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

export type ListenDialect = 'AR_LEVANTINE' | 'AR_GULF' | 'DARI' | 'EN'

interface ListenButtonProps {
  medicationRequestId: string
  medicationCode: string
  patientId: string
  dialect: ListenDialect
  hasAIConsent: boolean
  authToken?: string
  isOnline?: boolean
}

const DISCLAIMER_BY_DIALECT: Record<ListenDialect, string> = {
  EN: "This is a simplified explanation. Always follow your doctor's direct instructions.",
  AR_LEVANTINE: 'هاد شرح مبسّط. دايماً اتبع تعليمات الدكتور مباشرة.',
  AR_GULF: 'هذا شرح مبسّط. دايماً اتبع تعليمات الدكتور مباشرة.',
  DARI: 'این یک توضیح ساده است. همیشه دستورات مستقیم داکتر خود را دنبال کنید.',
}

export function ListenButton({
  medicationRequestId,
  medicationCode,
  patientId,
  dialect,
  hasAIConsent,
  authToken,
  isOnline = true,
}: ListenButtonProps) {
  const { colors } = useTheme()
  const [showPlayer, setShowPlayer] = useState(false)
  const [audioSource, setAudioSource] = useState<'CLOUD_TTS' | 'OFFLINE_FRAGMENT' | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up auto-dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [])

  const onPlaybackComplete = useCallback(() => {
    // AC #7: Log playback completion (fire-and-forget)
    if (audioSource) {
      logPlaybackCompletion(medicationRequestId, patientId, dialect, audioSource, authToken)
    }
    // Auto-dismiss after a short delay
    dismissTimer.current = setTimeout(() => {
      setShowPlayer(false)
    }, 1500)
  }, [medicationRequestId, patientId, dialect, audioSource, authToken])

  const { state, play, playSequence, pause, resume, dismiss } = useAudioPlayback(onPlaybackComplete)
  const [fallbackError, setFallbackError] = useState<string | null>(null)

  // AC #8: Hide button entirely when AI_PROCESSING consent not granted
  if (!hasAIConsent) return null

  const handleListenPress = async () => {
    // Guard against double-tap race condition
    if (state.isLoading || showPlayer) return

    setShowPlayer(true)
    setFallbackError(null)

    if (isOnline) {
      // Online path: generate TTS via Hub API
      try {
        const result = await generatePrescriptionAudio(
          medicationRequestId,
          dialect,
          patientId,
          authToken,
        )
        setAudioSource('CLOUD_TTS')
        try {
          await play(result.audioUrl)
        } catch {
          setFallbackError('Audio unavailable — please ask your doctor or pharmacist')
        }
        return
      } catch {
        // Fall through to offline attempt
      }
    }

    // Offline path: stitch pre-recorded voice fragments (AC #9)
    const fragments = getStitchableFragments(medicationCode, dialect)
    if (fragments && fragments.length > 0) {
      setAudioSource('OFFLINE_FRAGMENT')
      try {
        await playSequence(fragments, FRAGMENT_GAP_MS)
      } catch {
        setFallbackError('Audio unavailable — please ask your doctor or pharmacist')
      }
      return
    }

    // AC #5: Neither available — show explicit error
    setFallbackError('Audio unavailable — please ask your doctor or pharmacist')
  }

  const handleDismiss = async () => {
    await dismiss()
    setShowPlayer(false)
    setAudioSource(null)
    setFallbackError(null)
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!showPlayer) {
    return (
      <Pressable
        onPress={handleListenPress}
        style={({ pressed }) => [
          styles.listenBtn,
          { backgroundColor: colors.primary[50], borderColor: colors.primary[200] },
          pressed && { backgroundColor: colors.primary[100] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Listen to medication instructions"
        testID="listen-button"
      >
        <Text style={styles.listenIcon}>🔊</Text>
        <Text style={[styles.listenText, { color: colors.primary[700] }]}>Listen</Text>
      </Pressable>
    )
  }

  return (
    <View style={[styles.playerContainer, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="audio-player">
      {/* Disclaimer — AC #6 */}
      <Text style={[styles.disclaimer, { color: colors.textMuted }]} testID="tts-disclaimer">
        {DISCLAIMER_BY_DIALECT[dialect]}
      </Text>

      {state.isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Preparing audio...</Text>
        </View>
      )}

      {(state.error || fallbackError) && (
        <View testID="audio-error">
          <Text style={[styles.errorText, { color: colors.error }]}>
            {state.error ?? fallbackError}
          </Text>
          <Pressable onPress={handleDismiss} style={styles.dismissBtn} testID="dismiss-button">
            <Text style={[styles.dismissText, { color: colors.primary[600] }]}>Close</Text>
          </Pressable>
        </View>
      )}

      {!state.isLoading && !state.error && !fallbackError && (
        <View style={styles.controlsRow}>
          {/* Play/Pause button */}
          <Pressable
            onPress={state.isPlaying ? pause : resume}
            style={[styles.playPauseBtn, { backgroundColor: colors.primary[100] }]}
            accessibilityRole="button"
            accessibilityLabel={state.isPlaying ? 'Pause' : 'Play'}
            testID="play-pause-button"
          >
            <Text style={styles.playPauseIcon}>
              {state.isPlaying ? '⏸' : '▶️'}
            </Text>
          </Pressable>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: colors.secondary[100] }]}>
              <View
                style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%`, backgroundColor: colors.primary[500] }]}
                testID="progress-bar"
              />
            </View>
            <View style={styles.timeRow}>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(state.positionMs)}</Text>
              <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(state.durationMs)}</Text>
            </View>
          </View>

          {/* Dismiss */}
          <Pressable
            onPress={handleDismiss}
            style={styles.dismissBtn}
            accessibilityRole="button"
            accessibilityLabel="Close audio player"
            testID="dismiss-button"
          >
            <Text style={[styles.dismissIcon, { color: colors.textMuted }]}>✕</Text>
          </Pressable>
        </View>
      )}

      {state.isComplete && (
        <Text style={[styles.completeText, { color: colors.textMuted }]} testID="playback-complete">
          Playback complete
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: consumerBorderRadius.badge,
    borderWidth: 1,
  },
  listenIcon: {
    fontSize: 16,
  },
  listenText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  playerContainer: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    gap: 8,
    borderWidth: 1,
  },
  disclaimer: {
    fontSize: consumerTypography.captionSize - 1,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: consumerTypography.captionSize,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playPauseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseIcon: {
    fontSize: 16,
  },
  progressContainer: {
    flex: 1,
    gap: 2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 10,
  },
  dismissBtn: {
    padding: 4,
  },
  dismissIcon: {
    fontSize: 16,
  },
  dismissText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
    paddingVertical: 4,
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  completeText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
})
