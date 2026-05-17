import {
  registerFragment,
  registerFragments,
  clearFragments,
  getStitchableFragments,
  hasOfflineFragments,
  FRAGMENT_GAP_MS,
} from '@/lib/tts-fragment-stitcher'
import type { VoiceFragment } from '@/lib/tts-fragment-stitcher'

beforeEach(() => {
  clearFragments()
})

const amoxFragments: VoiceFragment[] = [
  { medicationCode: 'AMOX500', dialect: 'EN', fragmentType: 'medication_name', assetPath: 'assets/fragments/en/amox500_name.mp3' },
  { medicationCode: 'AMOX500', dialect: 'EN', fragmentType: 'dose_unit', assetPath: 'assets/fragments/en/amox500_dose.mp3' },
  { medicationCode: 'AMOX500', dialect: 'EN', fragmentType: 'frequency', assetPath: 'assets/fragments/en/amox500_freq.mp3' },
  { medicationCode: 'AMOX500', dialect: 'EN', fragmentType: 'duration', assetPath: 'assets/fragments/en/amox500_dur.mp3' },
  { medicationCode: 'AMOX500', dialect: 'EN', fragmentType: 'disclaimer', assetPath: 'assets/fragments/en/disclaimer.mp3' },
]

describe('tts-fragment-stitcher', () => {
  it('registers and retrieves fragments for a medication', () => {
    registerFragments(amoxFragments)

    const paths = getStitchableFragments('AMOX500', 'EN')
    expect(paths).not.toBeNull()
    expect(paths!.length).toBe(5)
  })

  it('returns fragments in correct order', () => {
    registerFragments(amoxFragments)

    const paths = getStitchableFragments('AMOX500', 'EN')
    expect(paths![0]).toContain('name')
    expect(paths![1]).toContain('dose')
    expect(paths![2]).toContain('freq')
    expect(paths![3]).toContain('dur')
    expect(paths![4]).toContain('disclaimer')
  })

  it('returns null for unknown medications', () => {
    registerFragments(amoxFragments)

    const paths = getStitchableFragments('UNKNOWN_MED', 'EN')
    expect(paths).toBeNull()
  })

  it('returns null for unknown dialects', () => {
    registerFragments(amoxFragments)

    const paths = getStitchableFragments('AMOX500', 'AR_LEVANTINE')
    expect(paths).toBeNull()
  })

  it('returns null when medication_name fragment is missing', () => {
    registerFragment({
      medicationCode: 'IBU200',
      dialect: 'EN',
      fragmentType: 'dose_unit',
      assetPath: 'assets/fragments/en/ibu200_dose.mp3',
    })

    const paths = getStitchableFragments('IBU200', 'EN')
    expect(paths).toBeNull()
  })

  it('hasOfflineFragments returns true for registered medications', () => {
    registerFragments(amoxFragments)

    expect(hasOfflineFragments('AMOX500', 'EN')).toBe(true)
    expect(hasOfflineFragments('UNKNOWN', 'EN')).toBe(false)
  })

  it('clears all fragments', () => {
    registerFragments(amoxFragments)
    expect(hasOfflineFragments('AMOX500', 'EN')).toBe(true)

    clearFragments()
    expect(hasOfflineFragments('AMOX500', 'EN')).toBe(false)
  })

  it('defines fragment gap as 200ms', () => {
    expect(FRAGMENT_GAP_MS).toBe(200)
  })
})
