/**
 * Patient search screen with debounced text input.
 * Queries local SQLCipher database — fully offline, no network required.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { usePatientStore } from '../stores/patient-store'
import { PatientResultList } from '../components/PatientResultList'
import type { RootStackParamList } from '../navigation/types'

interface PatientSearchScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PatientSearch'>
}

const DEBOUNCE_MS = 300

export function PatientSearchScreen({ navigation }: PatientSearchScreenProps) {
  const { results, isSearching, searchPatients, selectPatient } = usePatientStore()
  const [inputValue, setInputValue] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChangeText = useCallback(
    (text: string) => {
      setInputValue(text)

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      debounceTimer.current = setTimeout(() => {
        searchPatients(text)
      }, DEBOUNCE_MS)
    },
    [searchPatients]
  )

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  const handleSelectPatient = useCallback(
    (id: string) => {
      selectPatient(id)
      navigation.navigate('PatientSummary', { patientId: id })
    },
    [selectPatient, navigation]
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Patient Search</Text>
        <Text style={styles.subtitle}>Search by name or National ID</Text>
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Enter patient name or ID..."
          placeholderTextColor="#94A3B8"
          value={inputValue}
          onChangeText={handleChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search patients"
          testID="patient-search-input"
        />
      </View>
      {isSearching && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#3B82F6" />
        </View>
      )}
      {!isSearching && inputValue.trim() !== '' && results.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No patients found</Text>
        </View>
      )}
      <PatientResultList results={results} onSelectPatient={handleSelectPatient} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
})
