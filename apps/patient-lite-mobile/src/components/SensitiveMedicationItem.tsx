/**
 * SensitiveMedicationItem — privacy-gated medication card.
 *
 * Displays "Private Health Matter" with a lock icon by default.
 * On tap, prompts biometric authentication before revealing the
 * actual medication name, dose, and frequency. Auto-hides after 30s.
 *
 * Story 18.9: Sensitive Medication Privacy Flagging
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { TimelineIcon } from './timeline/TimelineIcon'
import { unlockWithBiometrics } from '@/lib/mobile-key-service'
import { emitAuditEvent } from '@/lib/audit'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

const AUTO_HIDE_MS = 30_000

interface SensitiveMedicationItemProps {
  medicationId: string
  medicationName: string
  patientId: string
}

export function SensitiveMedicationItem({
  medicationId,
  medicationName,
  patientId,
}: SensitiveMedicationItemProps) {
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { colors } = useTheme()

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handlePress = useCallback(async () => {
    if (authenticating) return

    // Manual collapse: tap while revealed hides immediately and clears timer
    if (revealed) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setRevealed(false)
      return
    }

    setError(null)
    setAuthenticating(true)

    try {
      const result = await unlockWithBiometrics()

      if (!result.success) {
        setError('Authentication failed')
        setAuthenticating(false)
        return
      }

      // AC #4: Emit PHI_UNMASK audit event — fire-and-forget
      emitAuditEvent({
        action: 'PHI_UNMASK',
        resourceType: 'MedicationRequest',
        resourceId: medicationId,
        patientId,
        outcome: 'success',
        metadata: { unmaskedBy: patientId },
      })

      setRevealed(true)
      setAuthenticating(false)

      // AC #5: Auto-hide after 30 seconds
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setRevealed(false)
        timerRef.current = null
      }, AUTO_HIDE_MS)
    } catch {
      setError('Authentication failed')
      setAuthenticating(false)
    }
  }, [revealed, authenticating, medicationId, patientId])

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        revealed
          ? {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.secondary[200],
            }
          : {
              backgroundColor: colors.mutedBg ?? '#F3F4F6',
              borderColor: colors.border,
            },
        pressed && !revealed && {
          backgroundColor: colors.secondary[50],
          borderColor: colors.secondary[400],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        revealed
          ? `Medicine: ${medicationName}`
          : 'Private Health Matter - tap to reveal'
      }
      testID={`sensitive-med-${medicationId}`}
    >
      <TimelineIcon icon={revealed ? 'pill' : 'clipboard'} isActive={false} />

      <Text
        style={[
          styles.medLabel,
          revealed
            ? { color: colors.textPrimary }
            : { color: colors.textMuted },
        ]}
        numberOfLines={2}
        testID={`sensitive-med-label-${medicationId}`}
      >
        {revealed ? medicationName : 'Private Health Matter'}
      </Text>

      {!revealed && (
        <Text style={[styles.lockIcon, { color: colors.textMuted }]} testID="lock-icon">
          {authenticating ? '...' : '\uD83D\uDD12'}
        </Text>
      )}

      {error && (
        <Text style={[styles.errorText, { color: colors.error }]} testID="auth-error">
          {error}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    alignItems: 'center',
    gap: 8,
    minWidth: 120,
    maxWidth: 160,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  medLabel: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    textAlign: 'center',
  },
  lockIcon: {
    fontSize: 18,
    writingDirection: 'ltr',
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
})
