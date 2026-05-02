import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { searchMedications } from '@/lib/medication-search'
import { searchVocab } from '@/lib/vocab-search'
import type { VocabMedicationEntry, VocabIcd10Entry } from '@/lib/db'

describe('Vocabulary search performance with 1000+ records', () => {
  beforeAll(async () => {
    // Clear and seed with 1000+ synthetic medications
    await db.vocabularyMedications.clear()
    await db.vocabularyIcd10.clear()

    const medications: VocabMedicationEntry[] = []
    const drugNames = [
      'Amoxicillin', 'Azithromycin', 'Metformin', 'Amlodipine', 'Lisinopril',
      'Losartan', 'Omeprazole', 'Paracetamol', 'Ibuprofen', 'Atorvastatin',
      'Ciprofloxacin', 'Doxycycline', 'Prednisolone', 'Salbutamol', 'Furosemide',
      'Warfarin', 'Clopidogrel', 'Diclofenac', 'Metronidazole', 'Cetirizine',
    ]
    const forms = ['Tablet', 'Capsule', 'Oral Suspension', 'Injection', 'Inhaler']
    const strengths = ['5 mg', '10 mg', '25 mg', '50 mg', '100 mg', '200 mg', '500 mg']

    for (let i = 0; i < 1200; i++) {
      medications.push({
        code: `PERF${String(i).padStart(4, '0')}`,
        display: `${drugNames[i % drugNames.length]} ${Math.floor(i / drugNames.length)}`,
        form: forms[i % forms.length],
        strength: strengths[i % strengths.length],
        version: 1,
      })
    }

    await db.vocabularyMedications.bulkPut(medications)

    // Seed 1000+ ICD-10 codes
    const icdCodes: VocabIcd10Entry[] = []
    const categories = ['Infectious', 'Metabolic', 'Cardiovascular', 'Respiratory', 'Neurological']
    for (let i = 0; i < 1200; i++) {
      icdCodes.push({
        code: `X${String(i).padStart(3, '0')}.${i % 10}`,
        display: `${categories[i % categories.length]} disorder type ${i}`,
        version: 1,
      })
    }

    await db.vocabularyIcd10.bulkPut(icdCodes)
  })

  it('medication search returns in <500ms for 1200 records', async () => {
    const start = performance.now()
    const results = await searchMedications('Amoxicillin')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(500)
    expect(results.length).toBeGreaterThan(0)
  })

  it('ICD-10 search returns in <500ms for 1200 records', async () => {
    const start = performance.now()
    const results = await searchVocab('Cardiovascular')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(500)
    expect(results.length).toBeGreaterThan(0)
  })

  it('fuzzy medication search works over 1000+ records', async () => {
    const results = await searchMedications('Amoxcilin') // misspelled
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.display).toContain('Amoxicillin')
  })

  it('fuzzy ICD-10 search works over 1000+ records', async () => {
    const results = await searchVocab('Cardovascular') // misspelled
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.display).toContain('Cardiovascular')
  })
})
