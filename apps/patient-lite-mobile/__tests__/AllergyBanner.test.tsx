import { render } from '@testing-library/react-native'
import { I18nManager, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { AllergyBanner } from '@/components/AllergyBanner'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'allergy.noKnown': 'No Known Allergies',
        'allergy.bannerAccessibility': `${opts?.count ?? 0} active allergies`,
      }
      return translations[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

const mockHaptics = jest.mocked(Haptics)

function makeAllergy(overrides: Partial<FhirAllergyIntolerance> = {}): FhirAllergyIntolerance {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        code: 'active',
      }],
    },
    verificationStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
        code: 'confirmed',
      }],
    },
    type: 'allergy',
    criticality: 'high',
    code: {
      coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin' }],
    },
    patient: { reference: 'Patient/patient-001' },
    _ultranos: {
      createdAt: '2026-01-15T10:00:00.000Z',
      recordedByRole: 'physician',
      isOfflineCreated: false,
      hlcTimestamp: '2026-01-15T10:00:00.000Z:0:node1',
    },
    meta: { lastUpdated: '2026-01-15T10:00:00.000Z' },
    ...overrides,
  } as FhirAllergyIntolerance
}

describe('AllergyBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default to non-web platform for haptics testing
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
  })

  it('renders allergy items with substance names', () => {
    const allergies = [
      makeAllergy({ id: '550e8400-e29b-41d4-a716-446655440001' }),
      makeAllergy({
        id: '550e8400-e29b-41d4-a716-446655440002',
        criticality: 'low',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '2', display: 'Latex' }] },
      }),
    ]

    const { getByTestId, getByText } = render(<AllergyBanner allergies={allergies} />)

    expect(getByTestId('allergy-banner')).toBeTruthy()
    expect(getByTestId('allergy-banner-item-550e8400-e29b-41d4-a716-446655440001')).toBeTruthy()
    expect(getByTestId('allergy-banner-item-550e8400-e29b-41d4-a716-446655440002')).toBeTruthy()
    expect(getByText('Penicillin')).toBeTruthy()
    expect(getByText('Latex')).toBeTruthy()
  })

  it('shows severity badges', () => {
    const allergies = [makeAllergy({ id: '550e8400-e29b-41d4-a716-446655440001', criticality: 'high' })]

    const { getByTestId, getByText } = render(<AllergyBanner allergies={allergies} />)

    expect(getByTestId('allergy-severity-550e8400-e29b-41d4-a716-446655440001')).toBeTruthy()
    expect(getByText('CRITICAL')).toBeTruthy()
  })

  it('visually distinguishes critical allergies with bold border', () => {
    const allergies = [makeAllergy({ id: '550e8400-e29b-41d4-a716-446655440001', criticality: 'high' })]

    const { getByTestId } = render(<AllergyBanner allergies={allergies} />)

    const item = getByTestId('allergy-banner-item-550e8400-e29b-41d4-a716-446655440001')
    const flatStyle = Array.isArray(item.props.style)
      ? Object.assign({}, ...item.props.style.filter(Boolean))
      : item.props.style

    expect(flatStyle.borderWidth).toBe(2)
    expect(flatStyle.borderColor).toBe('#DC2626')
  })

  it('shows exclamation icon for critical allergies', () => {
    const allergies = [makeAllergy({ criticality: 'high' })]
    const { getByText } = render(<AllergyBanner allergies={allergies} />)
    expect(getByText('‼️')).toBeTruthy()
  })

  it('shows warning icon for non-critical allergies', () => {
    const allergies = [makeAllergy({ criticality: 'low' })]
    const { getByText } = render(<AllergyBanner allergies={allergies} />)
    expect(getByText('⚠️')).toBeTruthy()
  })

  it('triggers haptic feedback for critical allergies on first render', () => {
    const allergies = [makeAllergy({ criticality: 'high' })]

    render(<AllergyBanner allergies={allergies} />)

    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Warning,
    )
  })

  it('does NOT trigger haptic feedback when no critical allergies', () => {
    const allergies = [makeAllergy({ criticality: 'low' })]

    render(<AllergyBanner allergies={allergies} />)

    expect(mockHaptics.notificationAsync).not.toHaveBeenCalled()
  })

  it('does NOT trigger haptic feedback on web platform', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })

    const allergies = [makeAllergy({ criticality: 'high' })]
    render(<AllergyBanner allergies={allergies} />)

    expect(mockHaptics.notificationAsync).not.toHaveBeenCalled()
  })

  it('shows gray "No Known Allergies" indicator when empty', () => {
    const { getByTestId, getByText } = render(<AllergyBanner allergies={[]} />)

    expect(getByTestId('allergy-banner-none')).toBeTruthy()
    expect(getByText('No Known Allergies')).toBeTruthy()
  })

  it('never collapses — renders all allergies visibly', () => {
    const allergies = [
      makeAllergy({ id: '550e8400-e29b-41d4-a716-446655440001' }),
      makeAllergy({ id: '550e8400-e29b-41d4-a716-446655440002', code: { coding: [{ system: 's', code: '2', display: 'Latex' }] } }),
      makeAllergy({ id: '550e8400-e29b-41d4-a716-446655440003', code: { coding: [{ system: 's', code: '3', display: 'Shellfish' }] } }),
    ]

    const { getByTestId } = render(<AllergyBanner allergies={allergies} />)

    expect(getByTestId('allergy-banner-item-550e8400-e29b-41d4-a716-446655440001')).toBeTruthy()
    expect(getByTestId('allergy-banner-item-550e8400-e29b-41d4-a716-446655440002')).toBeTruthy()
    expect(getByTestId('allergy-banner-item-550e8400-e29b-41d4-a716-446655440003')).toBeTruthy()
  })

  describe('RTL layout', () => {
    const originalIsRTL = I18nManager.isRTL

    afterEach(() => {
      I18nManager.isRTL = originalIsRTL
    })

    it('renders correctly in RTL mode', () => {
      I18nManager.isRTL = true
      const allergies = [makeAllergy()]

      const { getByTestId, getByText } = render(<AllergyBanner allergies={allergies} />)

      expect(getByTestId('allergy-banner')).toBeTruthy()
      expect(getByText('Penicillin')).toBeTruthy()
    })

    it('renders no-allergy state correctly in RTL', () => {
      I18nManager.isRTL = true

      const { getByTestId, getByText } = render(<AllergyBanner allergies={[]} />)

      expect(getByTestId('allergy-banner-none')).toBeTruthy()
      expect(getByText('No Known Allergies')).toBeTruthy()
    })
  })
})
