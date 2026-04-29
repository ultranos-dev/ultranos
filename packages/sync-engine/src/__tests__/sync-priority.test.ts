import { describe, it, expect } from 'vitest'
import { getSyncPriority, compareSyncPriority, SYNC_PRIORITY } from '../sync-priority'

describe('sync-priority', () => {
  describe('SYNC_PRIORITY', () => {
    it('assigns Consent the same priority as AllergyIntolerance (highest)', () => {
      expect(SYNC_PRIORITY.Consent).toBe(1)
      expect(SYNC_PRIORITY.Consent).toBe(SYNC_PRIORITY.AllergyIntolerance)
    })

    it('prioritizes Consent over standard clinical notes', () => {
      expect(SYNC_PRIORITY.Consent).toBeLessThan(SYNC_PRIORITY.ClinicalImpression!)
    })

    it('prioritizes Consent over vitals', () => {
      expect(SYNC_PRIORITY.Consent).toBeLessThan(SYNC_PRIORITY.Observation!)
    })

    it('prioritizes Consent over patient demographics', () => {
      expect(SYNC_PRIORITY.Consent).toBeLessThan(SYNC_PRIORITY.Patient!)
    })
  })

  describe('getSyncPriority', () => {
    it('returns correct priority for known resource types', () => {
      expect(getSyncPriority('Consent')).toBe(1)
      expect(getSyncPriority('MedicationRequest')).toBe(2)
      expect(getSyncPriority('Patient')).toBe(6)
    })

    it('returns 99 for unknown resource types', () => {
      expect(getSyncPriority('UnknownResource')).toBe(99)
    })
  })

  describe('compareSyncPriority', () => {
    it('returns negative when first resource has higher priority', () => {
      expect(compareSyncPriority('Consent', 'Patient')).toBeLessThan(0)
    })

    it('returns positive when second resource has higher priority', () => {
      expect(compareSyncPriority('Patient', 'Consent')).toBeGreaterThan(0)
    })

    it('returns 0 for equal priority resources', () => {
      expect(compareSyncPriority('Consent', 'AllergyIntolerance')).toBe(0)
    })

    it('sorts correctly when used as Array.sort comparator', () => {
      const resources = ['Patient', 'Observation', 'Consent', 'MedicationRequest', 'AllergyIntolerance']
      const sorted = resources.sort(compareSyncPriority)

      // Consent and AllergyIntolerance both have priority 1 — order between them is not guaranteed
      const topTwo = sorted.slice(0, 2).sort()
      expect(topTwo).toEqual(['AllergyIntolerance', 'Consent'])
      expect(sorted[2]).toBe('MedicationRequest')
      expect(sorted[sorted.length - 1]).toBe('Patient')
    })
  })
})
