import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { seedVocabularyIfEmpty } from '@/lib/vocabulary-seeder'

describe('seedVocabularyIfEmpty', () => {
  beforeEach(async () => {
    // Clear all vocabulary tables before each test
    await db.vocabularyMedications.clear()
    await db.vocabularyIcd10.clear()
    await db.vocabularyInteractions.clear()
  })

  it('seeds medications from bundled JSON when table is empty', async () => {
    const countBefore = await db.vocabularyMedications.count()
    expect(countBefore).toBe(0)

    await seedVocabularyIfEmpty()

    const countAfter = await db.vocabularyMedications.count()
    expect(countAfter).toBe(100) // 100 medications in the JSON
  })

  it('seeds ICD-10 codes from bundled JSON when table is empty', async () => {
    await seedVocabularyIfEmpty()

    const count = await db.vocabularyIcd10.count()
    expect(count).toBe(86) // 86 ICD-10 codes in the JSON
  })

  it('seeds interaction matrix from bundled JSON when table is empty', async () => {
    await seedVocabularyIfEmpty()

    const count = await db.vocabularyInteractions.count()
    expect(count).toBe(132) // 132 interactions in the JSON
  })

  it('sets version 1 for all seeded records', async () => {
    await seedVocabularyIfEmpty()

    const med = await db.vocabularyMedications.get('RX001')
    expect(med?.version).toBe(1)

    const icd = await db.vocabularyIcd10.get('A09')
    expect(icd?.version).toBe(1)

    const interaction = await db.vocabularyInteractions.toCollection().first()
    expect(interaction?.version).toBe(1)
  })

  it('is idempotent — skipped if tables already have data', async () => {
    // Seed once
    await seedVocabularyIfEmpty()
    const countFirst = await db.vocabularyMedications.count()

    // Seed again — should not duplicate
    await seedVocabularyIfEmpty()
    const countSecond = await db.vocabularyMedications.count()

    expect(countSecond).toBe(countFirst)
  })

  it('seeds medications with correct structure', async () => {
    await seedVocabularyIfEmpty()

    const amoxicillin = await db.vocabularyMedications.get('RX001')
    expect(amoxicillin).toBeDefined()
    expect(amoxicillin!.display).toBe('Amoxicillin')
    expect(amoxicillin!.form).toBe('Capsule')
    expect(amoxicillin!.strength).toBe('500 mg')
    expect(amoxicillin!.version).toBe(1)
  })

  it('seeds ICD-10 codes with correct structure', async () => {
    await seedVocabularyIfEmpty()

    const entry = await db.vocabularyIcd10.get('I10')
    expect(entry).toBeDefined()
    expect(entry!.display).toBe('Essential (primary) hypertension')
    expect(entry!.version).toBe(1)
  })
})
