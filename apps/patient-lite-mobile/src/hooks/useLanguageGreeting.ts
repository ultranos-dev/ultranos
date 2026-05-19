import { useCallback, useEffect, useRef } from 'react'
import { Audio } from 'expo-av'
import type { SupportedLocale } from '@/i18n'

/**
 * Audio greeting assets — 2-second warm greetings per PRD HP-002.
 * Each tap on a language option plays the corresponding greeting.
 *
 * Audio files must be placed at:
 *   assets/audio/greeting-en.mp3  — "Welcome"
 *   assets/audio/greeting-ar.mp3  — "أهلاً وسهلاً"
 *   assets/audio/greeting-prs.mp3 — "خوش آمدید"
 */
const GREETING_ASSETS: Record<SupportedLocale, ReturnType<typeof require>> = {
  en: require('../../../assets/audio/greeting-en.mp3'),
  ar: require('../../../assets/audio/greeting-ar.mp3'),
  prs: require('../../../assets/audio/greeting-prs.mp3'),
}

/**
 * Plays a 2-second audio greeting when a language option is tapped.
 * Uses expo-av with playsInSilentModeIOS so greetings play even when
 * the device is silenced (important for low-literacy user assistance).
 */
export function useLanguageGreeting() {
  const soundRef = useRef<Audio.Sound | null>(null)

  // Cleanup sound on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync()
    }
  }, [])

  const playGreeting = useCallback(async (locale: SupportedLocale) => {
    try {
      // Stop and unload any existing sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync()
        soundRef.current = null
      }

      // Configure audio mode to play even in silent mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      })

      const asset = GREETING_ASSETS[locale]
      if (!asset) return

      const { sound } = await Audio.Sound.createAsync(asset)
      soundRef.current = sound

      // Auto-unload when playback completes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync()
          soundRef.current = null
        }
      })

      await sound.playAsync()
    } catch {
      // Audio playback is non-critical — fail silently
    }
  }, [])

  return { playGreeting }
}
