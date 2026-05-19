/**
 * Story 11.7 Task 7: Visual progress indicators (AC #8).
 *
 * Replaces text-based progress with visual metaphors:
 * - Animated filling bar for sync progress
 * - Checkmark for completed actions
 * - Pulsing dots for "in progress" states
 *
 * Respects reduced-motion preference via AccessibilityInfo.
 */

import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Animated,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { consumerColors, consumerBorderRadius } from '@/theme/consumer'

interface ProgressBarProps {
  /** 0 to 1 */
  progress: number
  testID?: string
}

export function ProgressBar({ progress, testID }: ProgressBarProps) {
  const { t } = useTranslation()
  const animatedWidth = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      animatedWidth.setValue(progress)
    } else {
      Animated.timing(animatedWidth, {
        toValue: progress,
        duration: 300,
        useNativeDriver: false,
      }).start()
    }
  }, [progress, reduceMotion, animatedWidth])

  const widthInterpolation = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <View
      style={styles.barContainer}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      accessibilityLabel={t('progress.syncing')}
      testID={testID}
    >
      <View style={styles.barTrack}>
        <Animated.View
          style={[styles.barFill, { width: widthInterpolation }]}
        />
      </View>
    </View>
  )
}

interface CompletionCheckmarkProps {
  testID?: string
}

export function CompletionCheckmark({ testID }: CompletionCheckmarkProps) {
  const { t } = useTranslation()
  const scale = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub?.remove()
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1)
    } else {
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start()
    }
  }, [reduceMotion, scale])

  return (
    <Animated.View
      style={[styles.checkContainer, { transform: [{ scale }] }]}
      accessibilityLabel={t('progress.complete')}
      testID={testID}
    >
      <Text style={styles.checkEmoji}>✅</Text>
    </Animated.View>
  )
}

interface PulsingDotsProps {
  testID?: string
}

export function PulsingDots({ testID }: PulsingDotsProps) {
  const { t } = useTranslation()
  const opacity1 = useRef(new Animated.Value(0.3)).current
  const opacity2 = useRef(new Animated.Value(0.3)).current
  const opacity3 = useRef(new Animated.Value(0.3)).current
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub?.remove()
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      opacity1.setValue(1)
      opacity2.setValue(1)
      opacity3.setValue(1)
      return
    }

    const createPulse = (dot: Animated.Value, delay: number) => {
      // Apply initial stagger delay, then loop the pulse without re-delaying
      if (delay > 0) {
        return Animated.sequence([
          Animated.delay(delay),
          Animated.loop(
            Animated.sequence([
              Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
              Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
            ]),
          ),
        ])
      }
      return Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      )
    }

    const anim1 = createPulse(opacity1, 0)
    const anim2 = createPulse(opacity2, 200)
    const anim3 = createPulse(opacity3, 400)

    anim1.start()
    anim2.start()
    anim3.start()

    return () => {
      anim1.stop()
      anim2.stop()
      anim3.stop()
    }
  }, [reduceMotion, opacity1, opacity2, opacity3])

  return (
    <View
      style={styles.dotsContainer}
      accessibilityLabel={t('progress.inProgress')}
      testID={testID}
    >
      <Animated.View style={[styles.dot, { opacity: opacity1 }]} />
      <Animated.View style={[styles.dot, { opacity: opacity2 }]} />
      <Animated.View style={[styles.dot, { opacity: opacity3 }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  barContainer: {
    width: '100%',
  },
  barTrack: {
    height: 8,
    backgroundColor: consumerColors.primary[100],
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: consumerColors.primary[500],
    borderRadius: 4,
  },
  checkContainer: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmoji: {
    fontSize: 32,
    writingDirection: 'ltr',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: consumerColors.primary[500],
  },
})
