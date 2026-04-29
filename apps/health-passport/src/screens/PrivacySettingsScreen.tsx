import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import type { ConsentScope } from '@ultranos/shared-types'
import { ConsentStatus } from '@ultranos/shared-types'
import type { FhirConsent } from '@ultranos/shared-types'
import {
  consumerColors,
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
  consumerStyles,
} from '@/theme/consumer'
import { useConsentSettings, type ConsentCategoryState } from '@/hooks/useConsentSettings'
import { usePatientProfile } from '@/hooks/usePatientProfile'

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
  return (
    <View style={styles.toggleRow} testID={`consent-row-${category.scope}`}>
      <View style={styles.toggleInfo}>
        <Text style={consumerStyles.bodyText}>{category.label}</Text>
        <Text style={consumerStyles.captionText}>{category.description}</Text>
        {category.lastUpdated && (
          <Text
            style={[consumerStyles.captionText, styles.lastUpdated]}
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
          false: consumerColors.border,
          true: consumerColors.primary[300],
        }}
        thumbColor={
          category.enabled
            ? consumerColors.primary[500]
            : consumerColors.textMuted
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
  const isGranted = consent.status === ConsentStatus.ACTIVE
  const scopeLabel = consent.category.join(', ')

  return (
    <View style={styles.historyItem} testID="consent-history-item">
      <View style={styles.historyDot}>
        <View
          style={[
            styles.dot,
            { backgroundColor: isGranted ? consumerColors.secondary[500] : consumerColors.textMuted },
          ]}
        />
      </View>
      <View style={styles.historyContent}>
        <Text style={consumerStyles.bodyText}>
          {isGranted ? 'Granted' : 'Revoked'}: {scopeLabel}
        </Text>
        <Text style={consumerStyles.captionText}>
          {formatDate(consent.dateTime)}
        </Text>
        {consent._ultranos.withdrawalReason && (
          <Text style={[consumerStyles.captionText, styles.reason]}>
            Reason: {consent._ultranos.withdrawalReason}
          </Text>
        )}
      </View>
    </View>
  )
}

export function PrivacySettingsScreen() {
  const { patient, isLoading: profileLoading } = usePatientProfile()
  const {
    categories,
    consentHistory,
    isLoading,
    error,
    toggleConsent,
  } = useConsentSettings(patient?.id)

  const [showHistory, setShowHistory] = useState(false)

  if (profileLoading || isLoading) {
    return (
      <View style={[consumerStyles.screen, styles.centered]} testID="privacy-loading">
        <ActivityIndicator size="large" color={consumerColors.primary[500]} />
        <Text style={[consumerStyles.bodyText, styles.loadingText]}>
          Loading privacy settings...
        </Text>
      </View>
    )
  }

  if (error || !patient) {
    return (
      <View style={[consumerStyles.screen, styles.centered]} testID="privacy-error">
        <Text style={consumerStyles.subheaderText}>
          Unable to load settings
        </Text>
        <Text style={consumerStyles.bodyText}>
          {error ?? 'Profile data is not available.'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={consumerStyles.screen}
      contentContainerStyle={styles.scrollContent}
      testID="privacy-settings-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={consumerStyles.headerText}>Privacy Settings</Text>
        <Text style={consumerStyles.captionText}>
          Control who can access your health data
        </Text>
      </View>

      {/* Privacy Notice */}
      <View style={[consumerStyles.card, styles.noticeCard]}>
        <Text style={[consumerStyles.bodyText, styles.noticeText]}>
          By default, your data is restricted. Toggle on to allow healthcare
          providers to view specific categories of your medical information.
        </Text>
      </View>

      {/* Toggle Cards */}
      <View style={consumerStyles.card} testID="consent-toggles-card">
        <Text style={[consumerStyles.subheaderText, styles.sectionTitle]}>
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

      {/* History Toggle */}
      <Pressable
        onPress={() => setShowHistory((v) => !v)}
        style={[consumerStyles.card, styles.historyToggle]}
        accessibilityRole="button"
        accessibilityLabel={showHistory ? 'Hide consent history' : 'Show consent history'}
        testID="consent-history-toggle"
      >
        <Text style={consumerStyles.bodyText}>
          {showHistory ? 'Hide' : 'Show'} Consent History
        </Text>
        <Text style={styles.chevron}>{showHistory ? '\u25B2' : '\u25BC'}</Text>
      </Pressable>

      {/* History List */}
      {showHistory && (
        <View style={consumerStyles.card} testID="consent-history-list">
          <Text style={[consumerStyles.subheaderText, styles.sectionTitle]}>
            History of Changes
          </Text>
          {consentHistory.length === 0 ? (
            <Text style={consumerStyles.captionText}>
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
  noticeCard: {
    backgroundColor: consumerColors.primary[50],
    borderColor: consumerColors.primary[200],
  },
  noticeText: {
    color: consumerColors.primary[700],
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
    borderBottomColor: consumerColors.border,
    minHeight: consumerSpacing.touchTarget,
  },
  toggleInfo: {
    flex: 1,
    marginEnd: 12,
    gap: 2,
  },
  lastUpdated: {
    color: consumerColors.textMuted,
    fontStyle: 'italic',
  },
  historyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: consumerSpacing.touchTarget,
  },
  chevron: {
    fontSize: 14,
    color: consumerColors.textMuted,
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
  reason: {
    fontStyle: 'italic',
  },
})
