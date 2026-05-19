import { isSensitiveMedication, extractAtcCode } from '@/utils/medication-privacy'

describe('medication-privacy', () => {
  describe('isSensitiveMedication', () => {
    // AC #1: HIV/Antiretrovirals — ATC prefix J05A*
    it('returns true for tenofovir (J05AF01 — antiretroviral)', () => {
      expect(isSensitiveMedication('J05AF01')).toBe(true)
    })

    it('returns true for generic J05A prefix', () => {
      expect(isSensitiveMedication('J05A')).toBe(true)
    })

    // AC #1: Psychiatric — ATC prefix N05* (psycholeptics)
    it('returns true for olanzapine (N05AH03 — antipsychotic)', () => {
      expect(isSensitiveMedication('N05AH03')).toBe(true)
    })

    it('returns true for diazepam (N05BA01 — anxiolytic)', () => {
      expect(isSensitiveMedication('N05BA01')).toBe(true)
    })

    // AC #1: Psychiatric — ATC prefix N06* (psychoanaleptics)
    it('returns true for fluoxetine (N06AB03 — antidepressant)', () => {
      expect(isSensitiveMedication('N06AB03')).toBe(true)
    })

    // AC #1: Opioid substitution — ATC prefix N07BC*
    it('returns true for methadone (N07BC02 — opioid dependence)', () => {
      expect(isSensitiveMedication('N07BC02')).toBe(true)
    })

    it('returns true for buprenorphine (N07BC01 — opioid dependence)', () => {
      expect(isSensitiveMedication('N07BC01')).toBe(true)
    })

    // Non-sensitive medications
    it('returns false for captopril (C09AA01 — cardiovascular)', () => {
      expect(isSensitiveMedication('C09AA01')).toBe(false)
    })

    it('returns false for amoxicillin (J01CA04 — antibiotic)', () => {
      expect(isSensitiveMedication('J01CA04')).toBe(false)
    })

    it('returns false for ibuprofen (M01AE01 — anti-inflammatory)', () => {
      expect(isSensitiveMedication('M01AE01')).toBe(false)
    })

    // Edge cases
    it('returns false for null', () => {
      expect(isSensitiveMedication(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isSensitiveMedication(undefined)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isSensitiveMedication('')).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(isSensitiveMedication('j05af01')).toBe(true)
      expect(isSensitiveMedication('n05ah03')).toBe(true)
    })

    // N07B but NOT N07BC should be false (non-opioid-dependence)
    it('returns false for N07BA (nicotine dependence — not opioid)', () => {
      expect(isSensitiveMedication('N07BA01')).toBe(false)
    })
  })

  describe('extractAtcCode', () => {
    it('extracts ATC code from coding with ATC system', () => {
      const coding = [
        { system: 'http://www.whocc.no/atc', code: 'J05AF01' },
      ]
      expect(extractAtcCode(coding)).toBe('J05AF01')
    })

    it('extracts ATC code from WHO-ATC system', () => {
      const coding = [
        { system: 'http://www.whocc.no/WHO-ATC', code: 'N05AH03' },
      ]
      expect(extractAtcCode(coding)).toBe('N05AH03')
    })

    it('picks ATC entry from mixed coding systems', () => {
      const coding = [
        { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '313782' },
        { system: 'http://www.whocc.no/atc', code: 'J05AF01' },
      ]
      expect(extractAtcCode(coding)).toBe('J05AF01')
    })

    it('returns undefined for coding without ATC system', () => {
      const coding = [
        { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '313782' },
      ]
      expect(extractAtcCode(coding)).toBeUndefined()
    })

    it('returns undefined for undefined coding', () => {
      expect(extractAtcCode(undefined)).toBeUndefined()
    })

    it('returns undefined for empty coding array', () => {
      expect(extractAtcCode([])).toBeUndefined()
    })
  })
})
