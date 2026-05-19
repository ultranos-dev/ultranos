/**
 * AllergyBanner — prominent allergy display for patient-facing views.
 * Story 18.5, Task 2 (AC: #2, #3, #4, #10).
 *
 * CLAUDE.md Rule #4: "Allergy data gets the highest display prominence.
 * Allergies render first, in red, never collapsed, never behind a tab."
 *
 * - Red background, always visible, never collapsed
 * - Critical/severe allergies get bold red border + exclamation icon
 * - Haptic feedback on first render if critical allergies exist
 */
import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { getSubstanceName } from '@/data/allergy-queries'
import {
  consumerSpacing,
  consumerTypography,
  consumerBorderRadius,
} from '@/theme/consumer'

interface AllergyBannerProps {
  allergies: FhirAllergyIntolerance[]
  isLoading?: boolean
  error?: string | null
}

/** Check if an allergy is critical/severe (AC #4: criticality 'high' OR reaction severity 'severe') */
function isCriticalAllergy(allergy: FhirAllergyIntolerance): boolean {
  if (allergy.criticality === 'high') return true
  return allergy.reaction?.some((r) => r.severity === 'severe') ?? false
}

/** Map criticality to display label */
function getSeverityLabel(allergy: FhirAllergyIntolerance): string {
  switch (allergy.criticality) {
    case 'high':
      return 'CRITICAL'
    case 'low':
      return 'LOW'
    case 'unable-to-assess':
      return 'UNKNOWN'
    default:
      return 'MODERATE'
  }
}

/** Map criticality to badge background color */
function getSeverityBadgeColor(allergy: FhirAllergyIntolerance): string {
  if (isCriticalAllergy(allergy)) return '#991B1B' // dark red
  return '#DC2626' // medium red
}

function AllergyItem({ allergy }: { allergy: FhirAllergyIntolerance }) {
  const critical = isCriticalAllergy(allergy)
  const substance = getSubstanceName(allergy)
  const severityLabel = getSeverityLabel(allergy)

  // Reaction type from first reaction entry if available
  const reactionType = allergy.reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display

  return (
    <View
      style={[
        styles.allergyItem,
        critical && styles.allergyItemCritical,
      ]}
      testID={`allergy-banner-item-${allergy.id}`}
      accessibilityRole="summary"
      accessibilityLabel={`${critical ? 'Critical allergy' : 'Allergy'}: ${substance}. Severity: ${severityLabel}${reactionType ? `. Reaction: ${reactionType}` : ''}`}
    >
      <View style={styles.allergyItemHeader}>
        {/* Icon */}
        <Text style={styles.allergyIcon}>
          {critical ? '‼️' : '⚠️'}
        </Text>
        {/* Substance name */}
        <Text
          style={[
            styles.substanceName,
            critical && styles.substanceNameCritical,
          ]}
          numberOfLines={2}
        >
          {substance}
        </Text>
      </View>
      <View style={styles.badgeRow}>
        {/* Severity badge */}
        <View
          style={[
            styles.severityBadge,
            { backgroundColor: getSeverityBadgeColor(allergy) },
          ]}
          testID={`allergy-severity-${allergy.id}`}
        >
          <Text style={styles.severityBadgeText}>{severityLabel}</Text>
        </View>
        {/* Reaction type if available */}
        {reactionType && (
          <Text style={styles.reactionText} numberOfLines={1}>
            {reactionType}
          </Text>
        )}
      </View>
    </View>
  )
}

export function AllergyBanner({ allergies, isLoading, error }: AllergyBannerProps) {
  const { t } = useTranslation()
  const hapticFired = useRef(false)

  const hasCritical = allergies.some(isCriticalAllergy)

  // AC #10: Haptic feedback on first render if critical allergies exist
  useEffect(() => {
    if (hasCritical && !hapticFired.current && Platform.OS !== 'web') {
      hapticFired.current = true
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
        () => {
          // Haptics may be unavailable on some devices — safe to ignore
        },
      )
    }
  }, [hasCritical])

  // Loading state — don't assert "no allergies" while data is still loading
  if (isLoading) {
    return (
      <View style={styles.noAllergyContainer} testID="allergy-banner-loading">
        <View style={styles.noAllergyIconCircle}>
          <Text style={styles.noAllergyIcon}>…</Text>
        </View>
        <Text style={styles.noAllergyText}>
          {t('allergy.loading', { defaultValue: 'Checking allergies…' })}
        </Text>
      </View>
    )
  }

  // Error state — warn that allergy status is unknown, never claim "no allergies" on failure
  if (error) {
    return (
      <View style={[styles.noAllergyContainer, styles.errorContainer]} testID="allergy-banner-error">
        <View style={[styles.noAllergyIconCircle, styles.errorIconCircle]}>
          <Text style={styles.noAllergyIcon}>!</Text>
        </View>
        <Text style={[styles.noAllergyText, styles.errorText]}>
          {t('allergy.loadError', { defaultValue: 'Allergy status unavailable' })}
        </Text>
      </View>
    )
  }

  // No-allergy state (AC #6) — confirmed empty after successful load
  if (allergies.length === 0) {
    return (
      <View style={styles.noAllergyContainer} testID="allergy-banner-none">
        <View style={styles.noAllergyIconCircle}>
          <Text style={styles.noAllergyIcon}>✓</Text>
        </View>
        <Text style={styles.noAllergyText}>
          {t('allergy.noKnown', { defaultValue: 'No Known Allergies' })}
        </Text>
      </View>
    )
  }

  return (
    <View
      style={styles.bannerContainer}
      testID="allergy-banner"
      accessibilityRole="summary"
      accessibilityLabel={t('allergy.bannerAccessibility', {
        count: allergies.length,
        defaultValue: `${allergies.length} active allergies`,
      })}
    >
      {allergies.map((allergy) => (
        <AllergyItem key={allergy.id} allergy={allergy} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bannerContainer: {
    gap: 8,
  },
  allergyItem: {
    backgroundColor: '#FEE2E2',
    borderRadius: consumerBorderRadius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  allergyItemCritical: {
    borderWidth: 2,
    borderColor: '#DC2626',
    backgroundColor: '#FEE2E2',
  },
  allergyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  allergyIcon: {
    fontSize: 20,
    writingDirection: 'ltr', // Medical icons don't mirror in RTL
  },
  substanceName: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: '#991B1B',
    flex: 1,
  },
  substanceNameCritical: {
    fontSize: consumerTypography.bodySize + 2,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginStart: 30, // Align with text (past icon)
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  severityBadgeText: {
    fontSize: consumerTypography.captionSize - 1,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  reactionText: {
    fontSize: consumerTypography.captionSize,
    color: '#991B1B',
    flex: 1,
  },
  // No-allergy state (gray)
  noAllergyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: consumerBorderRadius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  noAllergyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noAllergyIcon: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '700',
  },
  noAllergyText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  errorIconCircle: {
    backgroundColor: '#F59E0B',
  },
  errorText: {
    color: '#92400E',
  },
})
