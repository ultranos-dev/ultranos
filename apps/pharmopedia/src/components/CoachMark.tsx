import { Modal, View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useCoachMarkStore } from '@/store/coach-mark-store'

interface Props {
  markKey: string
  hint: string
  visible: boolean
}

export function CoachMark({ markKey, hint, visible }: Props) {
  const colors = useThemeColors()
  const shouldShow = useCoachMarkStore((s) => s.shouldShow)
  const dismiss = useCoachMarkStore((s) => s.dismiss)

  if (!visible || !shouldShow(markKey)) return null

  return (
    <Modal transparent animationType="none" visible>
      <Pressable
        testID="coach-mark-overlay"
        style={styles.overlay}
        onPress={() => void dismiss(markKey)}
      >
        <Animated.View
          entering={FadeIn.delay(300).duration(250)}
          style={[styles.tooltip, { backgroundColor: colors.textPrimary }]}
        >
          <Text style={[styles.hint, { color: colors.surface }]}>{hint}</Text>
          <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap to dismiss</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
  },
  tooltip: {
    padding: Spacing[4],
    borderRadius: Radius.lg,
    maxWidth: 300,
    gap: Spacing[2],
  },
  hint: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansMedium,
    textAlign: 'center',
  },
  tapHint: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
