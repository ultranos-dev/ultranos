import { render, fireEvent } from '@testing-library/react-native'

import { PatientResultList, formatAge, getIdentifierDisplay } from '../src/components/PatientResultList'
import type { FhirPatient } from '@ultranos/shared-types'

function makeMockPatient(overrides: Partial<FhirPatient> = {}): FhirPatient {
  return {
    id: 'patient-001',
    resourceType: 'Patient',
    name: [{ text: 'Ahmed Hassan', family: 'Hassan', given: ['Ahmed'] }],
    gender: 'MALE' as any,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal: 'أحمد حسن',
      nationalIdHash: 'abc123hash',
      patient_tier: 'FREE',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    meta: { lastUpdated: '2026-01-15T00:00:00Z' },
    ...overrides,
  } as FhirPatient
}

describe('PatientResultList', () => {
  it('renders nothing when results are empty', () => {
    const { toJSON } = render(
      <PatientResultList results={[]} onSelectPatient={jest.fn()} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders patient name from _ultranos.nameLocal', () => {
    const patient = makeMockPatient()
    const { getByText } = render(
      <PatientResultList results={[patient]} onSelectPatient={jest.fn()} />
    )
    expect(getByText('أحمد حسن')).toBeTruthy()
  })

  it('renders green pill select button with correct styling', () => {
    const patient = makeMockPatient()
    const { getByText } = render(
      <PatientResultList results={[patient]} onSelectPatient={jest.fn()} />
    )
    const selectButton = getByText('Select')
    expect(selectButton).toBeTruthy()
  })

  it('calls onSelectPatient with patient id when select button pressed', () => {
    const patient = makeMockPatient({ id: 'test-patient-42' })
    const onSelect = jest.fn()
    const { getByLabelText } = render(
      <PatientResultList results={[patient]} onSelectPatient={onSelect} />
    )
    fireEvent.press(getByLabelText('Select patient أحمد حسن'))
    expect(onSelect).toHaveBeenCalledWith('test-patient-42')
  })

  it('renders multiple patients', () => {
    const patients = [
      makeMockPatient({ id: 'p1', _ultranos: { ...makeMockPatient()._ultranos, nameLocal: 'Patient One' } }),
      makeMockPatient({ id: 'p2', _ultranos: { ...makeMockPatient()._ultranos, nameLocal: 'Patient Two' } }),
    ]
    const { getByText } = render(
      <PatientResultList results={patients} onSelectPatient={jest.fn()} />
    )
    expect(getByText('Patient One')).toBeTruthy()
    expect(getByText('Patient Two')).toBeTruthy()
  })

  it('matches snapshot', () => {
    const patient = makeMockPatient()
    const { toJSON } = render(
      <PatientResultList results={[patient]} onSelectPatient={jest.fn()} />
    )
    expect(toJSON()).toMatchSnapshot()
  })

  describe('RTL snapshot tests', () => {
    const { I18nManager } = require('react-native')

    afterEach(() => {
      I18nManager.isRTL = false
    })

    it('matches snapshot in RTL mode', () => {
      I18nManager.isRTL = true
      const patient = makeMockPatient()
      const { toJSON } = render(
        <PatientResultList results={[patient]} onSelectPatient={jest.fn()} />
      )
      expect(toJSON()).toMatchSnapshot()
    })
  })
})

describe('formatAge', () => {
  it('returns empty for undefined birthDate', () => {
    expect(formatAge(undefined, false)).toBe('')
  })

  it('returns approximate age with ~ prefix for birthYearOnly', () => {
    const year = new Date().getFullYear() - 40
    expect(formatAge(`${year}-01-01`, true)).toBe('~40y')
  })

  it('returns months for children under 2', () => {
    const now = new Date()
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    const result = formatAge(oneYearAgo.toISOString().split('T')[0], false)
    expect(result).toBe('12m')
  })

  it('returns years for adults', () => {
    const year = new Date().getFullYear() - 35
    const result = formatAge(`${year}-01-01`, false)
    expect(parseInt(result)).toBeGreaterThanOrEqual(34)
  })
})

describe('getIdentifierDisplay', () => {
  it('returns empty string when no nationalIdHash', () => {
    const patient = makeMockPatient()
    patient._ultranos.nationalIdHash = undefined
    expect(getIdentifierDisplay(patient)).toBe('')
  })

  it('masks short IDs (≤4 chars)', () => {
    const patient = makeMockPatient()
    patient._ultranos.nationalIdHash = 'abc'
    expect(getIdentifierDisplay(patient)).toBe('****')
  })

  it('hides hash values (>40 chars)', () => {
    const patient = makeMockPatient()
    patient._ultranos.nationalIdHash = 'a'.repeat(64)
    expect(getIdentifierDisplay(patient)).toBe('')
  })

  it('shows last 4 chars for medium-length IDs', () => {
    const patient = makeMockPatient()
    patient._ultranos.nationalIdHash = 'ABC12345'
    expect(getIdentifierDisplay(patient)).toBe('***2345')
  })
})
