/**
 * GuardianHealthView — Read-only health summary for guardians.
 *
 * Story 18.7, Task 8: Guardian read-only health view.
 *
 * AC #8: Guardian can view patient's health summary (allergies, active
 *        medications, recent activity) but NOT modify clinical data.
 *
 * Shows a "Viewing as Guardian" banner and renders the patient's
 * health summary in read-only mode with all edit capabilities hidden.
 *
 * V1 simplification: guardian manages consent from the patient's device.
 * Remote guardian view is a future enhancement (V2).
 */
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { PatientHealthCard } from '@/components/PatientHealthCard'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import type { FhirMedicationRequestZod, FhirEncounterZod } from '@ultranos/shared-types'

interface GuardianHealthViewProps {
  allergies: FhirAllergyIntolerance[]
  medications: FhirMedicationRequestZod[]
  recentEncounters: FhirEncounterZod[]
}

export function GuardianHealthView({
  allergies,
  medications,
  recentEncounters,
}: GuardianHealthViewProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const activeMedications = medications.filter((med) => med.status === 'active')

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.scrollContent}
      testID="guardian-health-view"
    >
      {/* Guardian banner (AC #8) */}
      <View style={[styles.guardianBanner, { backgroundColor: colors.primary[50], borderColor: colors.primary[300] }]} testID="guardian-banner">
        <Text style={styles.bannerIcon}>{'\uD83D\uDEE1\uFE0F'}</Text>
        <Text style={[styles.bannerText, { color: colors.primary[700] }]}>{t('guardian.viewingAsGuardian')}</Text>
        <Text style={[styles.bannerSubtext, { color: colors.primary[600] }]}>
          {t('guardian.readOnlyNotice')}
        </Text>
      </View>

      {/* Allergies — highest display prominence per CLAUDE.md Rule #4: first, in red, never collapsed */}
      <View
        style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.error, borderWidth: 2 }]}
        testID="guardian-allergies-section"
      >
        <Text style={[styles.subheaderText, styles.allergySectionTitle, { color: colors.error }]}>
          {t('guardian.allergies')}
        </Text>
        {allergies.length === 0 ? (
          <Text style={[styles.captionText, { color: colors.textMuted }]}>{t('guardian.noAllergies')}</Text>
        ) : (
          <View style={styles.cardList}>
            {allergies.map((allergy) => (
              <PatientHealthCard
                key={allergy.id}
                variant="allergy"
                title={
                  allergy.code?.coding?.[0]?.display ??
                  allergy.code?.text ??
                  t('guardian.unknownAllergy')
                }
                subtitle={allergy.clinicalStatus?.coding?.[0]?.code}
                testID={`guardian-allergy-${allergy.id}`}
              />
            ))}
          </View>
        )}
      </View>

      {/* Active Medications */}
      <View
        style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        testID="guardian-medications-section"
      >
        <Text style={[styles.subheaderText, styles.sectionTitle, { color: colors.textPrimary }]}>
          {t('guardian.activeMedications')}
        </Text>
        {activeMedications.length === 0 ? (
          <Text style={[styles.captionText, { color: colors.textMuted }]}>{t('guardian.noMedications')}</Text>
        ) : (
          <View style={styles.cardList}>
            {activeMedications.map((med) => (
              <PatientHealthCard
                key={med.id}
                variant="medication"
                title={
                  med.medicationCodeableConcept?.coding?.[0]?.display ??
                  med.medicationCodeableConcept?.text ??
                  t('guardian.medication')
                }
                subtitle={med.status}
                testID={`guardian-med-${med.id}`}
              />
            ))}
          </View>
        )}
      </View>

      {/* Recent Activity */}
      <View
        style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        testID="guardian-activity-section"
      >
        <Text style={[styles.subheaderText, styles.sectionTitle, { color: colors.textPrimary }]}>
          {t('guardian.recentActivity')}
        </Text>
        {recentEncounters.length === 0 ? (
          <Text style={[styles.captionText, { color: colors.textMuted }]}>{t('guardian.noEncounters')}</Text>
        ) : (
          <View style={styles.activityList}>
            {recentEncounters.slice(0, 5).map((encounter) => (
              <View key={encounter.id} style={[styles.activityItem, { borderBottomColor: colors.border }]}>
                <View style={[styles.activityDot, { backgroundColor: colors.secondary[400] }]} />
                <View style={styles.activityContent}>
                  <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                    {encounter.type?.[0]?.coding?.[0]?.display ?? t('guardian.clinicalEncounter')}
                  </Text>
                  <Text style={[styles.captionText, { color: colors.textMuted }]}>
                    {encounter.period?.start
                      ? new Date(encounter.period.start).toLocaleDateString()
                      : '—'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
    gap: consumerSpacing.sectionGap,
  },
  guardianBanner: {
    borderWidth: 1,
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    alignItems: 'center',
    gap: 4,
  },
  bannerIcon: {
    fontSize: 32,
  },
  bannerText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  bannerSubtext: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    borderWidth: 1,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  bodyText: {
    fontSize: consumerTypography.bodySize,
  },
  captionText: {
    fontSize: consumerTypography.captionSize,
  },
  allergySectionTitle: {
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  cardList: {
    gap: 8,
  },
  activityList: {
    gap: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityContent: {
    flex: 1,
    gap: 2,
  },
})
