import {
  humanizeIcd10,
  humanizeEncounter,
  humanizeMedication,
} from '@/lib/fhir-humanizer'

describe('fhir-humanizer', () => {
  describe('humanizeIcd10', () => {
    it('maps respiratory codes (J*) to lungs icon', () => {
      const result = humanizeIcd10('J06.9')
      expect(result.icon).toBe('lungs')
      expect(result.label).toBe('Breathing Problem')
      expect(result.isSensitive).toBe(false)
    })

    it('maps heart codes (I*) to heart icon', () => {
      const result = humanizeIcd10('I10')
      expect(result.icon).toBe('heart')
      expect(result.label).toBe('Heart Condition')
    })

    it('maps musculoskeletal codes (M*) to bone icon', () => {
      const result = humanizeIcd10('M54.5')
      expect(result.icon).toBe('bone')
      expect(result.label).toBe('Bone or Joint Issue')
    })

    it('maps eye codes (H0-H5*) to eye icon', () => {
      const result = humanizeIcd10('H10.1')
      expect(result.icon).toBe('eye')
      expect(result.label).toBe('Eye Problem')
    })

    it('maps injury codes (S/T*) to bandage icon', () => {
      const result = humanizeIcd10('S42.0')
      expect(result.icon).toBe('bandage')
      expect(result.label).toBe('Injury')
    })

    it('maps pregnancy codes (O*) to baby icon', () => {
      const result = humanizeIcd10('O80')
      expect(result.icon).toBe('baby')
      expect(result.label).toBe('Pregnancy Care')
    })

    it('flags mental health codes (F*) as sensitive', () => {
      const result = humanizeIcd10('F32.1')
      expect(result.isSensitive).toBe(true)
      expect(result.label).toBe('Private Health Matter')
      expect(result.icon).toBe('brain')
    })

    it('flags HIV codes (B20-B24) as sensitive', () => {
      const result = humanizeIcd10('B20')
      expect(result.isSensitive).toBe(true)
      expect(result.label).toBe('Private Health Matter')
    })

    it('maps dental codes (K0*) to tooth icon, not stomach', () => {
      const result = humanizeIcd10('K01.1')
      expect(result.icon).toBe('tooth')
      expect(result.label).toBe('Dental Issue')
    })

    it('returns generic label for unknown codes', () => {
      const result = humanizeIcd10('Z99.9')
      expect(result.icon).toBe('clipboard')
      expect(result.label).toBe('Health Record')
      expect(result.isSensitive).toBe(false)
    })

    it('is case-insensitive', () => {
      const result = humanizeIcd10('j06.9')
      expect(result.icon).toBe('lungs')
    })

    it('returns Arabic labels when locale is ar', () => {
      const result = humanizeIcd10('J06.9', 'ar')
      expect(result.label).toBe('مشكلة في التنفس')
    })

    it('returns Dari labels when locale is fa-AF', () => {
      const result = humanizeIcd10('J06.9', 'fa-AF')
      expect(result.label).toBe('مشکل تنفسی')
    })

    it('returns Arabic sensitive label for mental health', () => {
      const result = humanizeIcd10('F32.1', 'ar')
      expect(result.label).toBe('مسألة صحية خاصة')
      expect(result.isSensitive).toBe(true)
    })
  })

  describe('humanizeEncounter', () => {
    it('returns generic Doctor Visit label when no reason codes', () => {
      const result = humanizeEncounter(undefined)
      expect(result.label).toBe('Doctor Visit')
      expect(result.icon).toBe('stethoscope')
    })

    it('uses ICD-10 code from reason when available', () => {
      const result = humanizeEncounter([
        {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'J06.9' }],
          text: 'Upper respiratory infection',
        },
      ])
      expect(result.icon).toBe('lungs')
      expect(result.label).toBe('Breathing Problem')
    })

    it('falls back to text when no ICD-10 coding and marks as sensitive', () => {
      const result = humanizeEncounter([
        { text: 'Routine checkup' },
      ])
      expect(result.label).toBe('Routine checkup')
      expect(result.icon).toBe('stethoscope')
      // Free-text fallback is always sensitive — may contain explicit diagnoses
      expect(result.isSensitive).toBe(true)
    })

    it('returns localized labels', () => {
      const result = humanizeEncounter(undefined, 'ar')
      expect(result.label).toBe('زيارة طبيب')
    })

    it('handles empty reason array', () => {
      const result = humanizeEncounter([])
      expect(result.label).toBe('Doctor Visit')
    })

    it('recognizes OID-based ICD system URIs', () => {
      const result = humanizeEncounter([
        {
          coding: [{ system: 'urn:oid:2.16.840.1.113883.6.90', code: 'J06.9' }],
        },
      ])
      expect(result.icon).toBe('lungs')
      expect(result.label).toBe('Breathing Problem')
    })
  })

  describe('humanizeMedication', () => {
    it('returns text from CodeableConcept when available', () => {
      const result = humanizeMedication({ text: 'Amoxicillin 500mg' })
      expect(result.label).toBe('Amoxicillin 500mg')
      expect(result.icon).toBe('pill')
      expect(result.isSensitive).toBe(false)
    })

    it('falls back to coding display', () => {
      const result = humanizeMedication({
        coding: [{ display: 'Ibuprofen' }],
      })
      expect(result.label).toBe('Ibuprofen')
    })

    it('returns generic Medicine label when no concept', () => {
      const result = humanizeMedication(undefined)
      expect(result.label).toBe('Medicine')
    })

    it('returns localized generic label', () => {
      const result = humanizeMedication(undefined, 'ar')
      expect(result.label).toBe('دواء')
    })

    it('returns Dari generic label', () => {
      const result = humanizeMedication(undefined, 'fa-AF')
      expect(result.label).toBe('دارو')
    })
  })
})
