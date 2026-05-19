/**
 * Story 11.7 Task 8: Emergency haptic and audio alerts (AC #9).
 *
 * Triggers haptic feedback + audio alert for:
 * - Severe allergy display
 * - Contraindicated drug warnings
 *
 * Uses expo-haptics and expo-av for alert audio.
 * Ensures haptic/audio only triggers once per view (not on re-renders).
 */

import { useRef, useCallback } from 'react'
import * as Haptics from 'expo-haptics'
import { Audio } from 'expo-av'

export type AlertType = 'severe-allergy' | 'contraindicated-drug'

export function useEmergencyAlerts() {
  const triggeredRef = useRef(new Set<string>())

  const triggerAlert = useCallback(async (type: AlertType, viewKey: string) => {
    const alertKey = `${type}:${viewKey}`
    // Only trigger once per view instance
    if (triggeredRef.current.has(alertKey)) return
    triggeredRef.current.add(alertKey)

    // Haptic feedback (medium intensity)
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch {
      // Haptics not available on this device — silent fallback
    }

    // Short alert tone for emergency/critical information (AC #9)
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'asset:/alert-tone.mp3' },
        { shouldPlay: true, volume: type === 'contraindicated-drug' ? 0.6 : 0.4 },
      )
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          sound.unloadAsync()
        }
      })
    } catch {
      // Audio not available — haptic alone is sufficient
    }
  }, [])

  const resetAlerts = useCallback(() => {
    triggeredRef.current.clear()
  }, [])

  return { triggerAlert, resetAlerts }
}
