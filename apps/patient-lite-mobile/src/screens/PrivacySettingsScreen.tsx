import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { ConsentScope } from '@ultranos/shared-types'
import { ConsentStatus, GrantorRole } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { useConsentSettings, type ConsentCategoryState } from '@/hooks/useConsentSettings'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { useGuardianLink } from '@/hooks/useGuardianLink'
import type { PrivacyStackParamList } from '@/navigation/types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ConsentToggleRowProps {
  category: ConsentCategoryState
  onToggle: (scope: ConsentScope) => void
}

function ConsentToggleRow({ category, onToggle }: ConsentToggleRowProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.toggleRow, { borderBottomColor: colors.border }]} testID={`consent-row-${category.scope}`}>
      <View style={styles.toggleInfo}>
        <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }}>{category.label}</Text>
        <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted }}>{category.description}</Text>
        {category.lastUpdated && (
          <Text
            style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted, fontStyle: 'italic' }}
            testID={`consent-updated-${category.scope}`}
          >
            Last updated: {formatDate(category.lastUpdated)}
          </Text>
        )}
      </View>
      <Switch
        value={category.enabled}
        onValueChange={() => onToggle(category.scope)}
        trackColor={{
          false: colors.border,
          true: colors.primary[300],
        }}
        thumbColor={
          category.enabled
            ? colors.primary[500]
            : colors.textMuted
        }
        accessibilityRole="switch"
        accessibilityLabel={`${category.label}: ${category.enabled ? 'Access granted' : 'Access restricted'}`}
        testID={`consent-toggle-${category.scope}`}
      />
    </View>
  )
}

interface ConsentHistoryItemProps {
  consent: FhirConsent
}

function ConsentHistoryItem({ consent }: ConsentHistoryItemProps) {
  const { colors } = useTheme()
  const isGranted = consent.status === ConsentStatus.ACTIVE
  const scopeLabel = consent.category.join(', ')
  const isGuardianAction = consent._ultranos.grantorRole === GrantorRole.GUARDIAN

  return (
    <View style={styles.historyItem} testID="consent-history-item">
      <View style={styles.historyDot}>
        <View
          style={[
            styles.dot,
            { backgroundColor: isGranted ? colors.secondary[500] : colors.textMuted },
          ]}
        />
      </View>
      <View style={styles.historyContent}>
        <View style={styles.historyTitleRow}>
          <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }}>
            {isGranted ? 'Granted' : 'Revoked'}: {scopeLabel}
          </Text>
          {isGuardianAction && (
            <View style={[styles.guardianBadge, { backgroundColor: colors.primary[100] }]} testID="guardian-consent-badge">
              <Text style={[styles.guardianBadgeText, { color: colors.primary[700] }]}>Set by Guardian</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted }}>
          {formatDate(consent.dateTime)}
        </Text>
        {consent._ultranos.withdrawalReason && (
          <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted, fontStyle: 'italic' }}>
            Reason: {consent._ultranos.withdrawalReason}
          </Text>
        )}
      </View>
    </View>
  )
}

export function PrivacySettingsScreen() {
  const { colors } = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<PrivacyStackParamList>>()
  const { patient, isLoading: profileLoading } = usePatientProfile()
  const {
    categories,
    consentHistory,
    isLoading,
    error,
    toggleConsent,
  } = useConsentSettings(
    patient?.id,
    guardianLink ? GrantorRole.GUARDIAN : GrantorRole.SELF,
    guardianLink?.guardianUserId,
  )
  const {
    guardianLink,
    isLoading: guardianLoading,
    unlinkCurrentGuardian,
  } = useGuardianLink(patient?.id)

  const [showHistory, setShowHistory] = useState(false)

  const handleUnlinkGuardian = () => {
    Alert.alert(
      'Unlink Guardian',
      'Are you sure? This will revoke all consents set by your guardian.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => void unlinkCurrentGuardian(),
        },
      ],
    )
  }

  if (profileLoading || isLoading) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.surface, paddingHorizontal: consumerSpacing.screenPadding }, styles.centered]} testID="privacy-loading">
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={[{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }, styles.loadingText]}>
          Loading privacy settings...
        </Text>
      </View>
    )
  }

  if (error || !patient) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.surface, paddingHorizontal: consumerSpacing.screenPadding }, styles.centered]} testID="privacy-error">
        <Text style={{ fontSize: consumerTypography.subheaderSize, fontWeight: consumerTypography.fontWeightLabel, color: colors.textPrimary }}>
          Unable to load settings
        </Text>
        <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }}>
          {error ?? 'Profile data is not available.'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface, paddingHorizontal: consumerSpacing.screenPadding }}
      contentContainerStyle={styles.scrollContent}
      testID="privacy-settings-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={{ fontSize: consumerTypography.headerSize, fontWeight: consumerTypography.fontWeightHeader, color: colors.textPrimary }}>Privacy Settings</Text>
        <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted }}>
          Control who can access your health data
        </Text>
      </View>

      {/* Privacy Notice */}
      <View style={[styles.themedCard, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
        <Text style={{ fontSize: consumerTypography.bodySize, color: colors.primary[700], lineHeight: 24 }}>
          By default, your data is restricted. Toggle on to allow healthcare
          providers to view specific categories of your medical information.
        </Text>
      </View>

      {/* Toggle Cards */}
      <View style={[styles.themedCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="consent-toggles-card">
        <Text style={[{ fontSize: consumerTypography.subheaderSize, fontWeight: consumerTypography.fontWeightLabel, color: colors.textPrimary }, styles.sectionTitle]}>
          Data Categories
        </Text>
        {categories.map((cat) => (
          <ConsentToggleRow
            key={cat.scope}
            category={cat}
            onToggle={toggleConsent}
          />
        ))}
      </View>

      {/* Guardian Section (AC #1) */}
      <View style={[styles.themedCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="guardian-section">
        <Text style={[{ fontSize: consumerTypography.subheaderSize, fontWeight: consumerTypography.fontWeightLabel, color: colors.textPrimary }, styles.sectionTitle]}>
          Guardian
        </Text>
        {guardianLoading ? (
          <ActivityIndicator size="small" color={colors.primary[500]} />
        ) : guardianLink ? (
          <View testID="guardian-linked-info">
            <View style={styles.guardianInfoRow}>
              <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }}>Guardian linked</Text>
              <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted }}>
                Linked since: {formatDate(guardianLink.linkedAt)}
              </Text>
              <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted }}>
                Phone: *** {guardianLink.guardianPhoneHint}
              </Text>
            </View>
            <Pressable
              style={[styles.unlinkButton, { borderColor: colors.error }]}
              onPress={handleUnlinkGuardian}
              accessibilityRole="button"
              testID="unlink-guardian-button"
            >
              <Text style={[styles.unlinkButtonText, { color: colors.error }]}>Unlink Guardian</Text>
            </Pressable>
          </View>
        ) : (
          <View testID="guardian-not-linked">
            <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }}>
              No guardian linked. Link a guardian to let them manage your privacy settings on your behalf.
            </Text>
            <Pressable
              style={[styles.linkGuardianButton, { backgroundColor: colors.primary[500] }]}
              onPress={() => navigation.navigate('GuardianLinkScreen')}
              accessibilityRole="button"
              testID="link-guardian-button"
            >
              <Text style={[styles.linkGuardianButtonText, { color: colors.onPrimary }]}>Link Guardian</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* History Toggle */}
      <Pressable
        onPress={() => setShowHistory((v) => !v)}
        style={[styles.themedCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styles.historyToggle]}
        accessibilityRole="button"
        accessibilityLabel={showHistory ? 'Hide consent history' : 'Show consent history'}
        testID="consent-history-toggle"
      >
        <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textSecondary, lineHeight: 24 }}>
          {showHistory ? 'Hide' : 'Show'} Consent History
        </Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>{showHistory ? '\u25B2' : '\u25BC'}</Text>
      </Pressable>

      {/* History List */}
      {showHistory && (
        <View style={[styles.themedCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="consent-history-list">
          <Text style={[{ fontSize: consumerTypography.subheaderSize, fontWeight: consumerTypography.fontWeightLabel, color: colors.textPrimary }, styles.sectionTitle]}>
            History of Changes
          </Text>
          {consentHistory.length === 0 ? (
            <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted }}>
              No consent changes recorded yet.
            </Text>
          ) : (
            consentHistory.map((consent) => (
              <ConsentHistoryItem key={consent.id} consent={consent} />
            ))
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: consumerSpacing.cardPadding,
  },
  scrollContent: {
    paddingVertical: consumerSpacing.sectionGap,
    gap: consumerSpacing.sectionGap,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  themedCard: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: consumerSpacing.touchTarget,
  },
  toggleInfo: {
    flex: 1,
    marginEnd: 12,
    gap: 2,
  },
  historyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: consumerSpacing.touchTarget,
  },
  chevron: {
    fontSize: 14,
  },
  historyItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  historyDot: {
    paddingTop: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  historyContent: {
    flex: 1,
    gap: 2,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  guardianInfoRow: {
    gap: 4,
    marginBottom: 12,
  },
  linkGuardianButton: {
    borderRadius: consumerBorderRadius.button,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    minHeight: consumerSpacing.touchTarget,
    justifyContent: 'center',
  },
  linkGuardianButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  unlinkButton: {
    borderWidth: 1,
    borderRadius: consumerBorderRadius.button,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    minHeight: consumerSpacing.touchTarget,
    justifyContent: 'center',
  },
  unlinkButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  guardianBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: consumerBorderRadius.badge,
  },
  guardianBadgeText: {
    fontSize: 11,
    fontWeight: consumerTypography.fontWeightLabel,
  },
})
