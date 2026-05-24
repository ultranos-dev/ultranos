import { db, type LocalPatient } from '@/lib/db'

export interface PatientRegistrationData {
  nameGiven: string
  nameFather?: string
  gender: 'male' | 'female' | 'other' | 'unknown'
  birthYear?: number
  phone?: string
  preferredLanguage?: string
  allergies?: string[]
}

export async function registerPatientLocally(data: PatientRegistrationData): Promise<LocalPatient> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const patient: LocalPatient = {
    id,
    nameGiven: data.nameGiven.trim(),
    nameFather: data.nameFather?.trim() || undefined,
    gender: data.gender,
    birthYear: data.birthYear,
    phone: data.phone?.trim() || undefined,
    preferredLanguage: data.preferredLanguage,
    allergies: data.allergies?.filter(Boolean) || undefined,
    createdAt: now,
    source: 'registered',
  }

  await db.patients.put(patient)

  // Enqueue sync to Hub
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'Patient',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(patient),
    status: 'pending',
    hlcTimestamp: now, // Simplified — real HLC uses the hlcNow() helper
    createdAt: now,
    retryCount: 0,
  })

  return patient
}
