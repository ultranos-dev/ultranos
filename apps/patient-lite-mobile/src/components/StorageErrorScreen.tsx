import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerTypography,
  consumerBorderRadius,
} from '@/theme/consumer'
import type { SafeError } from '@/utils/error-sanitizer'
import { openReportIssue } from '@/utils/report-issue'

interface StorageErrorScreenProps {
  onRetry?: () => void
  safeError: SafeError
  retriesExhausted?: boolean
}

export function StorageErrorScreen({ onRetry, safeError, retriesExhausted }: StorageErrorScreenProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  const handleReportIssue = async () => {
    try {
      await openReportIssue(safeError)
    } catch {
      // Linking failure — no further action possible on recovery screen
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="storage-error-screen">
      <View style={styles.content}>
        {/* Icon-led: large storage illustration */}
        <Text style={styles.illustration} accessibilityLabel={t('icons.warningTriangle')}>
          💾
        </Text>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {retriesExhausted ? t('errorBoundary.unavailableTitle') : t('errorBoundary.storageTitle')}
        </Text>

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {retriesExhausted ? t('errorBoundary.unavailableSubtitle') : t('errorBoundary.storageSubtitle')}
        </Text>

        {onRetry && (
          <Pressable
            onPress={onRetry}
            style={[styles.retryButton, { backgroundColor: colors.primary[600] }]}
            accessibilityRole="button"
            accessibilityLabel={t('errorBoundary.storageRetry')}
            testID="storage-retry-button"
          >
            <Text style={styles.retryIcon}>🔄</Text>
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>{t('errorBoundary.storageRetry')}</Text>
          </Pressable>
        )}

        {/* Report Issue — available on storage errors too */}
        <Pressable
          onPress={handleReportIssue}
          style={styles.reportButton}
          accessibilityRole="button"
          accessibilityLabel={t('errorBoundary.reportIssue')}
          testID="storage-report-button"
        >
          <Text style={[styles.reportText, { color: colors.primary[600] }]}>{t('errorBoundary.reportIssue')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  illustration: {
    fontSize: 120,
    marginBottom: consumerSpacing.cardPadding,
    writingDirection: 'ltr',
  },
  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightBody,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: consumerBorderRadius.card,
    minWidth: 200,
    marginBottom: 16,
  },
  retryIcon: {
    fontSize: 24,
    marginEnd: 8,
    writingDirection: 'ltr',
  },
  retryText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
    // color applied inline via colors.onPrimary for dark mode support
  },
  reportButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  reportText: {
    fontSize: consumerTypography.captionSize,
    textDecorationLine: 'underline',
  },
})
