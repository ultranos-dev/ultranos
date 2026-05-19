/**
 * Patient summary screen — demographics + medical summary.
 * Allergies render FIRST, in red (#DC2626), NEVER collapsed (CLAUDE.md rule #4).
 */
import { useEffect } from 'react'
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { usePatientStore } from '../stores/patient-store'
import { auditPatientRead } from '../lib/audit'
import { formatAge, getIdentifierDisplay } from '../lib/patient-display'
import type { RootStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<RootStackParamList, 'PatientSummary'>

export function PatientSummaryScreen({ route }: Props) {
  const selectedPatient = usePatientStore((s) => s.selectedPatient)

  if (!selectedPatient) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No patient selected</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Audit: emit PHI_READ on summary screen load (AC #8, CLAUDE.md rule #6)
  useEffect(() => {
    if (selectedPatient) {
      auditPatientRead(
        selectedPatient.id,
        'PRACTITIONER_REF',
        selectedPatient.meta.lastUpdated,
        'summary'
      )
    }
  }, [selectedPatient?.id])

  const displayName =
    selectedPatient._ultranos?.nameLocal || selectedPatient.name?.[0]?.text || 'Unknown'
  const age = formatAge(selectedPatient.birthDate, selectedPatient.birthYearOnly)
  const gender = selectedPatient.gender
  const nationalIdDisplay = getIdentifierDisplay(selectedPatient)

  // Parse allergies and active meds from the stored FHIR JSON extensions
  const allergies = (selectedPatient as any)._allergies ?? []
  const activeMeds = (selectedPatient as any)._activeMeds ?? []

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ALLERGIES FIRST — red, never collapsed (CLAUDE.md rule #4) */}
        <View style={styles.allergySection} testID="allergy-section">
          <Text style={styles.allergySectionTitle}>Allergies</Text>
          {allergies.length === 0 ? (
            <Text style={styles.allergyNone}>No known allergies</Text>
          ) : (
            allergies.map((allergy: string, idx: number) => (
              <View key={idx} style={styles.allergyItem}>
                <Text style={styles.allergyText}>{allergy}</Text>
              </View>
            ))
          )}
        </View>

        {/* Active Medications */}
        <View style={styles.medsSection} testID="medications-section">
          <Text style={styles.medsSectionTitle}>Active Medications</Text>
          {activeMeds.length === 0 ? (
            <Text style={styles.medsNone}>No active medications</Text>
          ) : (
            activeMeds.map((med: string, idx: number) => (
              <View key={idx} style={styles.medItem}>
                <Text style={styles.medText}>{med}</Text>
              </View>
            ))
          )}
        </View>

        {/* Demographics */}
        <View style={styles.demographicsSection} testID="demographics-section">
          <Text style={styles.sectionTitle}>Demographics</Text>
          <DemographicRow label="Full Name" value={displayName} />
          {age && <DemographicRow label="Age" value={age} />}
          <DemographicRow label="Gender" value={gender} />
          {nationalIdDisplay !== '' && (
            <DemographicRow label="National ID" value={nationalIdDisplay} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function DemographicRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.demographicRow}>
      <Text style={styles.demographicLabel}>{label}</Text>
      <Text style={styles.demographicValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#94A3B8',
  },

  // Allergy section — FIRST, RED, NEVER COLLAPSED
  allergySection: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  allergySectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
    marginBottom: 8,
  },
  allergyNone: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    fontStyle: 'italic',
  },
  allergyItem: {
    paddingVertical: 4,
  },
  allergyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Active medications
  medsSection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  medsSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0369A1',
    marginBottom: 8,
  },
  medsNone: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    fontStyle: 'italic',
  },
  medItem: {
    paddingVertical: 4,
  },
  medText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },

  // Demographics
  demographicsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
  },
  demographicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  demographicLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  demographicValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
})
