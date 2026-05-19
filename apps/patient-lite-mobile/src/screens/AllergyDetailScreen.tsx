/**
 * AllergyDetailScreen — read-only allergy detail view.
 * Story 18.5, Task 6 (AC: #8).
 *
 * Shows: substance name, reaction, severity, criticality,
 * onset date, recorded date, recording provider, clinical notes.
 * All text translated; clinical terms (substance names) remain in English per Story 11.3.
 */
import { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  I18nManager,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { getSubstanceName } from '@/data/allergy-queries'
import { emitAuditEvent } from '@/lib/audit'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { useMedicalHistory } from '@/hooks/useMedicalHistory'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import type { TimelineStackParamList } from '@/navigation/types'

type AllergyDetailRouteProp = RouteProp<TimelineStackParamList, 'AllergyDetailScreen'>

function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-u-ca-gregory', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getCriticalityLabel(criticality: string): string {
  switch (criticality) {
    case 'high': return 'CRITICAL'
    case 'low': return 'LOW'
    case 'unable-to-assess': return 'UNKNOWN'
    default: return 'MODERATE'
  }
}

function DetailRow({
  label,
  value,
  testID,
}: {
  label: string
  value: string
  testID?: string
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.detailRow} testID={testID}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  )
}

export function AllergyDetailScreen() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const route = useRoute<AllergyDetailRouteProp>()
  const navigation = useNavigation()
  const { allergyId } = route.params
  const { patient } = usePatientProfile()
  const { events, isLoading } = useMedicalHistory(patient?.id)
  const auditedRef = useRef<string | null>(null)

  const [allergy, setAllergy] = useState<FhirAllergyIntolerance | null>(null)

  useEffect(() => {
    // Search all allergy events (active + resolved) so resolved allergies navigated from timeline are found
    const allergyEvent = events.find((e) => e.type === 'allergy' && e.id === allergyId)
    const found = allergyEvent ? (allergyEvent.resource as FhirAllergyIntolerance) : null
    setAllergy(found)

    if (found && patient?.id && auditedRef.current !== allergyId) {
      auditedRef.current = allergyId
      emitAuditEvent({
        action: 'PHI_DISPLAY',
        resourceType: 'AllergyIntolerance',
        resourceId: allergyId,
        patientId: patient.id,
        outcome: 'success',
        metadata: { screen: 'AllergyDetailScreen' },
      })
    }
  }, [allergyId, events, patient?.id])

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    )
  }

  if (!allergy) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]} testID="allergy-detail-not-found">
        <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>
          {t('errors.generic')}
        </Text>
      </View>
    )
  }

  const substance = getSubstanceName(allergy)
  const reactionSeverity = allergy.reaction?.[0]?.severity
  const isCritical = allergy.criticality === 'high' || reactionSeverity === 'severe'
  const reactionText = allergy.reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display
  const onsetDate = formatDate(allergy.onsetDateTime)
  const recordedDate = formatDate(allergy.recordedDate)
  const recorderName = allergy.recorder?.display
  const clinicalNotes = allergy.note?.[0]?.text

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.scrollContent}
      testID="allergy-detail-screen"
    >
      {/* Back button */}
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        testID="allergy-detail-back"
      >
        <Text style={[styles.backText, { color: colors.primary[600] }]}>
          {I18nManager.isRTL ? '→' : '←'} {t('common.back')}
        </Text>
      </Pressable>

      {/* Title */}
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
        {t('allergy.detailTitle')}
      </Text>

      {/* Substance banner */}
      <View
        style={[
          styles.substanceBanner,
          isCritical && styles.substanceBannerCritical,
        ]}
        testID="allergy-detail-substance"
      >
        <Text style={styles.substanceIcon}>{isCritical ? '‼️' : '⚠️'}</Text>
        <View style={styles.substanceInfo}>
          {/* Clinical terms in English per Story 11.3 */}
          <Text style={styles.substanceName}>{substance}</Text>
          <Text style={[styles.criticalityBadge, isCritical && styles.criticalityBadgeCritical]}>
            {getCriticalityLabel(allergy.criticality)}
          </Text>
        </View>
      </View>

      {/* Detail fields */}
      <View style={[styles.detailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <DetailRow
          label={t('allergy.reaction')}
          value={reactionText ?? t('allergy.noReactionInfo')}
          testID="allergy-detail-reaction"
        />
        <DetailRow
          label={t('allergy.severity')}
          value={reactionSeverity ? reactionSeverity.charAt(0).toUpperCase() + reactionSeverity.slice(1) : t('allergy.noReactionInfo')}
          testID="allergy-detail-severity"
        />
        <DetailRow
          label={t('allergy.criticality')}
          value={getCriticalityLabel(allergy.criticality)}
          testID="allergy-detail-criticality"
        />
        <DetailRow
          label={t('allergy.onsetDate')}
          value={onsetDate ?? t('allergy.noOnsetDate')}
          testID="allergy-detail-onset"
        />
        <DetailRow
          label={t('allergy.recordedDate')}
          value={recordedDate ?? t('allergy.noOnsetDate')}
          testID="allergy-detail-recorded-date"
        />
        <DetailRow
          label={t('allergy.recordedBy')}
          value={recorderName ?? t('allergy.noRecordedBy')}
          testID="allergy-detail-recorded-by"
        />
      </View>

      {/* Clinical Notes */}
      <View style={[styles.notesCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <Text style={[styles.notesLabel, { color: colors.textMuted }]}>
          {t('allergy.clinicalNotes')}
        </Text>
        <Text
          style={[styles.notesText, { color: colors.textPrimary }]}
          testID="allergy-detail-notes"
        >
          {clinicalNotes ?? t('allergy.noNotesAvailable')}
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  scrollContent: {
    paddingVertical: consumerSpacing.sectionGap,
    gap: 16,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  backButton: {
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  screenTitle: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  substanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: consumerBorderRadius.card,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  substanceBannerCritical: {
    borderWidth: 2,
    borderColor: '#DC2626',
  },
  substanceIcon: {
    fontSize: 28,
    writingDirection: 'ltr',
  },
  substanceInfo: {
    flex: 1,
    gap: 4,
  },
  substanceName: {
    fontSize: consumerTypography.bodySize + 4,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  criticalityBadge: {
    fontSize: consumerTypography.captionSize,
    fontWeight: '700',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  criticalityBadgeCritical: {
    color: '#991B1B',
  },
  detailCard: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    borderWidth: 1,
    gap: 16,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 22,
  },
  notesCard: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    borderWidth: 1,
    gap: 8,
  },
  notesLabel: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 22,
  },
})
