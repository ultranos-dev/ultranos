import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { FhirPatient, FhirConsent } from '@ultranos/shared-types'
import type { FhirEncounterZod, FhirMedicationRequestZod } from '@ultranos/shared-types'
import { FhirPatientSchema, FhirEncounterSchema, FhirMedicationRequestSchema } from '@ultranos/shared-types'
import { z } from 'zod'

/**
 * Offline patient profile storage abstraction.
 *
 * - **Mobile (iOS/Android):** Uses expo-secure-store for encrypted storage.
 *   SQLCipher integration is handled at the database layer; this module
 *   provides a simple key-value interface for the patient profile cache.
 *
 * - **PWA:** Uses in-memory storage with Key-in-Memory enforcement —
 *   data is wiped on tab close / logout per CLAUDE.md requirements.
 */

const PATIENT_PROFILE_KEY = 'ultranos_patient_profile'

/** In-memory store for PWA — cleared on tab close (Key-in-Memory enforcement) */
let memoryStore: Map<string, string> = new Map()

export async function savePatientProfile(patient: FhirPatient): Promise<void> {
  const serialized = JSON.stringify(patient)

  if (Platform.OS === 'web') {
    // Key-in-Memory: only in-memory, never localStorage/sessionStorage
    memoryStore.set(PATIENT_PROFILE_KEY, serialized)
    return
  }

  await SecureStore.setItemAsync(PATIENT_PROFILE_KEY, serialized)
}

/**
 * Parse and validate stored JSON as FhirPatient.
 * If data is corrupted or schema-mismatched, clears the bad entry and returns null.
 */
function parseStoredPatient(data: string, clearCorrupt: () => void): FhirPatient | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    clearCorrupt()
    return null
  }
  const result = FhirPatientSchema.safeParse(parsed)
  if (!result.success) {
    clearCorrupt()
    return null
  }
  return result.data as FhirPatient
}

export async function loadPatientProfile(): Promise<FhirPatient | null> {
  if (Platform.OS === 'web') {
    const data = memoryStore.get(PATIENT_PROFILE_KEY)
    if (!data) return null
    return parseStoredPatient(data, () => memoryStore.delete(PATIENT_PROFILE_KEY))
  }

  const data = await SecureStore.getItemAsync(PATIENT_PROFILE_KEY)
  if (!data) return null
  return parseStoredPatient(data, () => {
    void SecureStore.deleteItemAsync(PATIENT_PROFILE_KEY)
  })
}

export async function clearPatientProfile(): Promise<void> {
  if (Platform.OS === 'web') {
    memoryStore.delete(PATIENT_PROFILE_KEY)
    return
  }

  await SecureStore.deleteItemAsync(PATIENT_PROFILE_KEY)
}

// --- Medical History Storage ---

const MEDICAL_HISTORY_KEY_PREFIX = 'ultranos_medical_history_'

export interface StoredMedicalHistory {
  encounters: FhirEncounterZod[]
  medications: FhirMedicationRequestZod[]
}

export async function saveMedicalHistory(
  patientId: string,
  history: StoredMedicalHistory,
): Promise<void> {
  const key = MEDICAL_HISTORY_KEY_PREFIX + patientId
  const serialized = JSON.stringify(history)

  if (Platform.OS === 'web') {
    memoryStore.set(key, serialized)
    return
  }

  await SecureStore.setItemAsync(key, serialized)
}

export async function loadMedicalHistory(
  patientId: string,
): Promise<StoredMedicalHistory | null> {
  const key = MEDICAL_HISTORY_KEY_PREFIX + patientId

  let data: string | null | undefined
  if (Platform.OS === 'web') {
    data = memoryStore.get(key) ?? null
  } else {
    data = await SecureStore.getItemAsync(key)
  }

  if (!data) return null

  const StoredMedicalHistorySchema = z.object({
    encounters: z.array(FhirEncounterSchema),
    medications: z.array(FhirMedicationRequestSchema),
  })

  try {
    const parsed = JSON.parse(data)
    const result = StoredMedicalHistorySchema.safeParse(parsed)
    if (!result.success) return null
    return result.data as StoredMedicalHistory
  } catch {
    return null
  }
}

// --- Consent Storage ---

const CONSENT_KEY_PREFIX = 'ultranos_consent_'

export async function saveConsents(
  patientId: string,
  consents: FhirConsent[],
): Promise<void> {
  const key = CONSENT_KEY_PREFIX + patientId
  const serialized = JSON.stringify(consents)

  if (Platform.OS === 'web') {
    memoryStore.set(key, serialized)
    return
  }

  await SecureStore.setItemAsync(key, serialized)
}

export async function loadConsents(
  patientId: string,
): Promise<FhirConsent[]> {
  const key = CONSENT_KEY_PREFIX + patientId

  let data: string | null | undefined
  if (Platform.OS === 'web') {
    data = memoryStore.get(key) ?? null
  } else {
    data = await SecureStore.getItemAsync(key)
  }

  if (!data) return []

  try {
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    // Validate each consent record — discard malformed entries
    return parsed.filter((entry: unknown): entry is FhirConsent => {
      if (typeof entry !== 'object' || entry === null) return false
      const obj = entry as Record<string, unknown>
      return (
        obj.resourceType === 'Consent' &&
        typeof obj.id === 'string' &&
        typeof obj.status === 'string' &&
        typeof obj.dateTime === 'string' &&
        Array.isArray(obj.category) &&
        typeof obj.patient === 'object' &&
        obj.patient !== null &&
        typeof (obj.patient as Record<string, unknown>).reference === 'string' &&
        typeof obj._ultranos === 'object' &&
        obj._ultranos !== null
      )
    })
  } catch {
    return []
  }
}

/**
 * Wipe all in-memory data. Called on logout or tab close (PWA).
 * Enforces Key-in-Memory policy from CLAUDE.md.
 */
export function wipeMemoryStore(): void {
  memoryStore = new Map()
}
