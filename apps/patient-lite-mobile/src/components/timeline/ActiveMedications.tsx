import { useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { TimelineIcon } from './TimelineIcon'
import { ListenButton } from '@/components/ListenButton'
import { SensitiveMedicationItem } from '@/components/SensitiveMedicationItem'
import type { ListenDialect } from '@/components/ListenButton'
import type { TimelineEvent } from '@/hooks/useMedicalHistory'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

/** Extract the first medication code from the FHIR resource for offline fragment lookup */
function getMedicationCode(med: TimelineEvent): string {
  if (med.type === 'medication') {
    const rx = med.resource as FhirMedicationRequestZod
    const coding = rx.medicationCodeableConcept?.coding
    if (coding && coding.length > 0 && coding[0].code) {
      return coding[0].code
    }
  }
  return med.id // fallback to ID if no code available
}
import { useTheme } from '@/theme/ThemeProvider'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

interface ActiveMedicationsProps {
  medications: TimelineEvent[]
  patientId?: string
  dialect?: ListenDialect
  hasAIConsent?: boolean
  authToken?: string
  isOnline?: boolean
}

interface ActiveMedCardProps {
  med: TimelineEvent
  patientId?: string
  dialect?: ListenDialect
  hasAIConsent?: boolean
  authToken?: string
  isOnline?: boolean
}

function ActiveMedCard({ med, patientId, dialect, hasAIConsent, authToken, isOnline }: ActiveMedCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { colors } = useTheme()

  return (
    <Pressable
      onPress={() => setExpanded((prev) => !prev)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.secondary[200],
          shadowColor: colors.shadow,
        },
        pressed && {
          backgroundColor: colors.secondary[50],
          borderColor: colors.secondary[400],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Active medicine: ${med.label}. Tap for details.`}
      testID={`active-med-${med.id}`}
    >
      <TimelineIcon icon={med.icon} isActive />
      <Text style={[styles.medLabel, { color: colors.textPrimary }]} numberOfLines={2}>
        {med.label}
      </Text>
      <View style={[styles.activeBadge, { backgroundColor: colors.activeBadgeBg, borderColor: colors.activeBadgeBorder }]}>
        <Text style={[styles.activeBadgeText, { color: colors.activeBadgeText }]}>Active</Text>
      </View>
      {/* Story 24.2: Listen button for TTS */}
      {patientId && (
        <ListenButton
          medicationRequestId={med.id}
          medicationCode={getMedicationCode(med)}
          patientId={patientId}
          dialect={dialect ?? 'EN'}
          hasAIConsent={hasAIConsent ?? false}
          authToken={authToken}
          isOnline={isOnline}
        />
      )}
      {expanded && (
        <View style={[styles.detailSection, { borderTopColor: colors.border }]} testID={`active-med-detail-${med.id}`}>
          <Text style={[styles.detailText, { color: colors.textPrimary }]}>{med.label}</Text>
          <Text style={[styles.detailDate, { color: colors.textMuted }]}>
            Started: {med.date ? new Date(med.date).toLocaleDateString('en-u-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export function ActiveMedications({ medications, patientId, dialect, hasAIConsent, authToken, isOnline }: ActiveMedicationsProps) {
  const { colors } = useTheme()

  if (medications.length === 0) return null

  return (
    <View style={styles.container} testID="active-medications">
      <Text
        style={[styles.subheaderText, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        Current Care
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        testID="active-medications-list"
      >
        {medications.map((med) =>
          med.isSensitive ? (
            <SensitiveMedicationItem
              key={med.id}
              medicationId={med.id}
              medicationName={med.label}
              patientId={patientId ?? ''}
            />
          ) : (
            <ActiveMedCard
              key={med.id}
              med={med}
              patientId={patientId}
              dialect={dialect}
              hasAIConsent={hasAIConsent}
              authToken={authToken}
              isOnline={isOnline}
            />
          ),
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  scrollContent: {
    gap: 12,
    paddingEnd: consumerSpacing.screenPadding,
  },
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
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: consumerBorderRadius.badge,
    borderWidth: 1,
  },
  activeBadgeText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  detailSection: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: 2,
    alignSelf: 'stretch',
  },
  detailText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  detailDate: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
})
