import { Modal, View, Text, Pressable, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'
import { useReducedMotion } from './useReducedMotion'
import { Button } from './Button'

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  /** Renders the confirm action in the destructive (danger) style. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
  testID?: string
}

/**
 * Themed, RTL-aware confirmation modal — the in-app replacement for the native
 * `Alert.alert` confirm/cancel pattern. Backdrop tap and the hardware back
 * button both cancel. Prefer driving this through the `useConfirm` hook.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const reduced = useReducedMotion()
  const textAlign = rtl ? ('right' as const) : ('left' as const)

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        {/* Backdrop sibling (not a parent) so button presses never bubble to it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityLabel={cancelLabel}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <View
          style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
          testID={testID}
        >
          <Text style={[styles.title, { color: colors.textPrimary, textAlign }, rtl && styles.arabic]}>
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textSecondary, textAlign }, rtl && styles.arabic]}>
              {message}
            </Text>
          ) : null}
          <View style={[styles.actions, rtl && styles.actionsRtl]}>
            <View style={styles.action}>
              <Button
                label={cancelLabel}
                variant="secondary"
                onPress={onCancel}
                testID={testID ? `${testID}-cancel` : undefined}
              />
            </View>
            <View style={styles.action}>
              <Button
                label={confirmLabel}
                variant={destructive ? 'destructive' : 'primary'}
                onPress={onConfirm}
                testID={testID ? `${testID}-confirm` : undefined}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[6] },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing[5],
    gap: Spacing[3],
  },
  title: { fontFamily: FontFamily.headingBold, fontSize: FontSize.lg },
  message: { fontFamily: FontFamily.sans, fontSize: FontSize.base, lineHeight: FontSize.base * 1.4 },
  actions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[2] },
  actionsRtl: { flexDirection: 'row-reverse' },
  action: { flex: 1 },
  arabic: { fontFamily: FontFamily.arabic },
})
