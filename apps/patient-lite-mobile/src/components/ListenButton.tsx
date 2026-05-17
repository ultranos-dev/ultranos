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

import { useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useAudioPlayback } from '@/hooks/useAudioPlayback'
import { generatePrescriptionAudio, logPlaybackCompletion } from '@/lib/tts-api'
import { getStitchableFragments, FRAGMENT_GAP_MS } from '@/lib/tts-fragment-stitcher'
import {
  consumerColors,
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

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
  const [showPlayer, setShowPlayer] = useState(false)
  const [audioSource, setAudioSource] = useState<'CLOUD_TTS' | 'OFFLINE_FRAGMENT' | null>(null)

  const onPlaybackComplete = useCallback(() => {
    // AC #7: Log playback completion (fire-and-forget)
    if (audioSource) {
      logPlaybackCompletion(medicationRequestId, patientId, dialect, audioSource, authToken)
    }
    // Auto-dismiss after a short delay
    setTimeout(() => {
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
        style={({ pressed }) => [styles.listenBtn, pressed && styles.listenBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Listen to medication instructions"
        testID="listen-button"
      >
        <Text style={styles.listenIcon}>🔊</Text>
        <Text style={styles.listenText}>Listen</Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.playerContainer} testID="audio-player">
      {/* Disclaimer — AC #6 */}
      <Text style={styles.disclaimer} testID="tts-disclaimer">
        {DISCLAIMER_BY_DIALECT[dialect]}
      </Text>

      {state.isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={consumerColors.primary[600]} />
          <Text style={styles.loadingText}>Preparing audio...</Text>
        </View>
      )}

      {(state.error || fallbackError) && (
        <View testID="audio-error">
          <Text style={styles.errorText}>
            {state.error ?? fallbackError}
          </Text>
          <Pressable onPress={handleDismiss} style={styles.dismissBtn} testID="dismiss-button">
            <Text style={styles.dismissText}>Close</Text>
          </Pressable>
        </View>
      )}

      {!state.isLoading && !state.error && !fallbackError && (
        <View style={styles.controlsRow}>
          {/* Play/Pause button */}
          <Pressable
            onPress={state.isPlaying ? pause : resume}
            style={styles.playPauseBtn}
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
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.round(state.progress * 100)}%` }]}
                testID="progress-bar"
              />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(state.positionMs)}</Text>
              <Text style={styles.timeText}>{formatTime(state.durationMs)}</Text>
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
            <Text style={styles.dismissIcon}>✕</Text>
          </Pressable>
        </View>
      )}

      {state.isComplete && (
        <Text style={styles.completeText} testID="playback-complete">
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
    backgroundColor: consumerColors.primary[50],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: consumerBorderRadius.badge,
    borderWidth: 1,
    borderColor: consumerColors.primary[200],
  },
  listenBtnPressed: {
    backgroundColor: consumerColors.primary[100],
  },
  listenIcon: {
    fontSize: 16,
  },
  listenText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.primary[700],
  },
  playerContainer: {
    backgroundColor: consumerColors.surfaceElevated,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    gap: 8,
    borderWidth: 1,
    borderColor: consumerColors.border,
  },
  disclaimer: {
    fontSize: consumerTypography.captionSize - 1,
    color: consumerColors.textMuted,
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
    color: consumerColors.textMuted,
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
    backgroundColor: consumerColors.primary[100],
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
    backgroundColor: consumerColors.secondary[100],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: consumerColors.primary[500],
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 10,
    color: consumerColors.textMuted,
  },
  dismissBtn: {
    padding: 4,
  },
  dismissIcon: {
    fontSize: 16,
    color: consumerColors.textMuted,
  },
  dismissText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.primary[600],
    textAlign: 'center',
    paddingVertical: 4,
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    color: 'hsl(0, 70%, 50%)',
    textAlign: 'center',
  },
  completeText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textMuted,
    textAlign: 'center',
  },
})
