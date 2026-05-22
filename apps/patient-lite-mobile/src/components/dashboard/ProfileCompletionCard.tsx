/**
 * ProfileCompletionCard — Dashboard nudge card showing profile completion progress.
 * Shows when patient profile is incomplete (missing grandfather name, address, etc.)
 * Dismissible up to 3 times (tracked in AsyncStorage), then stays hidden.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

const DISMISS_COUNT_KEY = 'profile_completion_dismiss_count'
const MAX_DISMISSALS = 3

interface ProfileCompletionCardProps {
  patient: {
    nameGiven?: string | null
    nameFather?: string | null
    nameGrandfather?: string | null
    gender?: string | null
    addressProvinceOrigin?: string | null
    phone?: string | null
  }
  onPress: () => void
}

const PROFILE_FIELDS = [
  'nameGiven',
  'nameFather',
  'nameGrandfather',
  'gender',
  'addressProvinceOrigin',
  'phone',
] as const

export function ProfileCompletionCard({ patient, onPress }: ProfileCompletionCardProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [dismissed, setDismissed] = useState(false)
  const [dismissCount, setDismissCount] = useState(0)

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_COUNT_KEY).then((val) => {
      const count = val ? parseInt(val, 10) : 0
      setDismissCount(count)
      if (count >= MAX_DISMISSALS) setDismissed(true)
    }).catch(() => {})
  }, [])

  const completed = PROFILE_FIELDS.filter(
    (f) => patient[f] != null && patient[f] !== ''
  )
  const total = PROFILE_FIELDS.length
  const isComplete = completed.length === total

  const handleDismiss = useCallback(async () => {
    const newCount = dismissCount + 1
    setDismissCount(newCount)
    setDismissed(true)
    try {
      await AsyncStorage.setItem(DISMISS_COUNT_KEY, String(newCount))
    } catch {}
  }, [dismissCount])

  if (isComplete || dismissed) return null

  const progressPercent = Math.round((completed.length / total) * 100)

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('registration.completeProfile')}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('registration.completeProfile')}
        </Text>
        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismiss')}
        >
          <Text style={[styles.dismissText, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      <Text style={[styles.progressText, { color: colors.textSecondary }]}>
        {completed.length} / {total} {t('registration.fieldsCompleted')}
      </Text>

      {/* Progress bar */}
      <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressBarFill,
            { backgroundColor: colors.primary[500], width: `${progressPercent}%` },
          ]}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.md,
    borderWidth: 1,
    marginBottom: consumerSpacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  dismissText: {
    fontSize: 16,
    lineHeight: 20,
  },
  progressText: {
    fontSize: consumerTypography.captionSize,
    marginTop: consumerSpacing.xs,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    marginTop: consumerSpacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
})
