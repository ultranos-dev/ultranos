/**
 * Patient search result list component.
 * Displays name, age, gender, National ID with UX-DR2 green pill select button.
 */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import type { FhirPatient } from '@ultranos/shared-types'
import { formatAge, getIdentifierDisplay } from '../lib/patient-display'

interface PatientResultListProps {
  results: FhirPatient[]
  onSelectPatient: (id: string) => void
}

export function PatientResultList({ results, onSelectPatient }: PatientResultListProps) {
  if (results.length === 0) {
    return null
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <PatientResultItem patient={item} onSelect={() => onSelectPatient(item.id)} />
      )}
      contentContainerStyle={styles.list}
    />
  )
}

function PatientResultItem({
  patient,
  onSelect,
}: {
  patient: FhirPatient
  onSelect: () => void
}) {
  const displayName = patient._ultranos?.nameLocal || patient.name?.[0]?.text || 'Unknown'
  const age = formatAge(patient.birthDate, patient.birthYearOnly)
  const gender = patient.gender
  const nationalId = getIdentifierDisplay(patient)

  return (
    <View style={styles.item}>
      <View style={styles.info}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.details}>
          {age && `${age} · `}{gender}{nationalId && ` · ${nationalId}`}
        </Text>
      </View>
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [styles.selectButton, pressed && styles.selectButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Select patient ${displayName}`}
      >
        <Text style={styles.selectButtonText}>Select</Text>
      </Pressable>
    </View>
  )
}

// Re-export shared helpers for backward compatibility with tests
export { formatAge, getIdentifierDisplay } from '../lib/patient-display'

const styles = StyleSheet.create({
  list: {
    paddingBottom: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  info: {
    flex: 1,
    marginInlineEnd: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  details: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  selectButton: {
    backgroundColor: '#9fe870',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
  },
  selectButtonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  selectButtonText: {
    color: '#163300',
    fontWeight: '600',
    fontSize: 14,
  },
})
