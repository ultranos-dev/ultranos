import { db } from './db'
import type { VocabMedicationEntry, VocabIcd10Entry, VocabInteractionEntry } from './db'
import medicationsData from '@/assets/vocab/medications_subset.json'
import icd10Data from '@/assets/vocab/icd10_subset.json'
import interactionData from '@/assets/vocab/interaction_matrix.json'

interface RawMedication {
  code: string
  display: string
  form: string
  strength: string
  atcCode?: string
}

interface RawIcd10 {
  code: string
  display: string
}

interface RawInteraction {
  drugA: string
  drugB: string
  severity: string
  description: string
}

/**
 * Seeds vocabulary tables from bundled JSON on first load.
 * Idempotent — skips if tables already contain data.
 */
export async function seedVocabularyIfEmpty(): Promise<void> {
  const results = await Promise.allSettled([
    seedMedications(),
    seedIcd10(),
    seedInteractions(),
  ])

  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') {
      const names = ['medications', 'icd10', 'interactions']
      console.warn(`[vocab-seeder] Failed to seed ${names[i]}:`, result.reason instanceof Error ? result.reason.message : 'unknown error')
    }
  }
}

async function seedMedications(): Promise<void> {
  await db.transaction('rw', db.vocabularyMedications, async () => {
    const count = await db.vocabularyMedications.count()
    if (count > 0) return
    if (!Array.isArray(medicationsData)) {
      throw new Error('[vocab-seeder] medications JSON is not an array')
    }
    const entries: VocabMedicationEntry[] = (medicationsData as RawMedication[]).map((m) => ({
      code: m.code,
      display: m.display,
      form: m.form,
      strength: m.strength,
      atcCode: m.atcCode,
      version: 1,
    }))
    await db.vocabularyMedications.bulkPut(entries)
  })
}

async function seedIcd10(): Promise<void> {
  await db.transaction('rw', db.vocabularyIcd10, async () => {
    const count = await db.vocabularyIcd10.count()
    if (count > 0) return
    if (!Array.isArray(icd10Data)) {
      throw new Error('[vocab-seeder] icd10 JSON is not an array')
    }
    const entries: VocabIcd10Entry[] = (icd10Data as RawIcd10[]).map((d) => ({
      code: d.code,
      display: d.display,
      version: 1,
    }))
    await db.vocabularyIcd10.bulkPut(entries)
  })
}

async function seedInteractions(): Promise<void> {
  await db.transaction('rw', db.vocabularyInteractions, async () => {
    const count = await db.vocabularyInteractions.count()
    if (count > 0) return
    if (!Array.isArray(interactionData)) {
      throw new Error('[vocab-seeder] interactions JSON is not an array')
    }
    const entries: Omit<VocabInteractionEntry, 'id'>[] = (interactionData as RawInteraction[]).map((i) => ({
      drugA: i.drugA,
      drugB: i.drugB,
      severity: i.severity,
      description: i.description,
      version: 1,
    }))
    await db.vocabularyInteractions.bulkAdd(entries)

    // Set initial last-synced timestamp for staleness checks (Story 25.2)
    try {
      localStorage.setItem('ultranos:vocab-last-synced:interactions', new Date().toISOString())
    } catch {
      // localStorage unavailable — staleness tracking degraded but not fatal
    }
  })
}
