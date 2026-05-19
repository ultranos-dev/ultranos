/**
 * Story 11.7 Task 6: Long-press info bubbles (AC #7).
 *
 * Wraps any icon-based action. On long-press (500ms):
 * - Shows a floating bubble with text explanation
 * - Auto-dismisses after 3 seconds or on tap anywhere
 * - Screen readers announce the tooltip text via accessibilityHint
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from 'react-native'
import { consumerBorderRadius, consumerTypography } from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'

interface LongPressTooltipProps {
  /** The text to show in the tooltip bubble */
  tooltip: string
  children: ReactNode
  /** Delay before long-press triggers (default: 500ms) */
  delayMs?: number
  /** Auto-dismiss after this many ms (default: 3000ms) */
  dismissMs?: number
  testID?: string
}

export function LongPressTooltip({
  tooltip,
  children,
  delayMs = 500,
  dismissMs = 3000,
  testID,
}: LongPressTooltipProps) {
  const { colors } = useTheme()
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTooltip = useCallback(() => {
    setVisible(true)
    timerRef.current = setTimeout(() => {
      setVisible(false)
    }, dismissMs)
  }, [dismissMs])

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }, [])

  // Clear timer on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <View testID={testID}>
      <Pressable
        onLongPress={showTooltip}
        delayLongPress={delayMs}
        accessibilityHint={tooltip}
      >
        {children}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={hideTooltip}
      >
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={hideTooltip}>
          <View style={[styles.bubble, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="tooltip-bubble">
            <Text style={[styles.text, { color: colors.textPrimary }]}>{tooltip}</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubble: {
    borderRadius: consumerBorderRadius.card,
    paddingHorizontal: 20,
    paddingVertical: 14,
    maxWidth: 260,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    borderWidth: 1,
  },
  text: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    lineHeight: 22,
  },
})
