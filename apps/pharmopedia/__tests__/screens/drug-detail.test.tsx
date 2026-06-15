import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import DrugDetailScreen from '../../app/drug/[atcCode]'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { useAuthStore } from '@/store/auth-store'

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { refreshSession: jest.fn() } },
}))

jest.mock('@/db/drug-catalog', () => ({
  getDrugRowByAtcCode: jest.fn(),
  scopeEntryForRole: jest.fn(),
}))
jest.mock('@/db/migrations', () => ({ getDatabase: jest.fn() }))
jest.mock('@/api/drug-catalog', () => ({ getDrugByAtcCodeApi: jest.fn() }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ atcCode: 'J01CA04' }),
  useRouter: () => ({ back: jest.fn() }),
}))

const tier1Entry = {
  atcCode: 'J01CA04', innName: 'amoxicillin', brandNames: ['Augmentin'],
  doseForms: ['tablet'], therapeuticClass: 'Antibiotic', localNames: {},
  summaryPlain: { en: 'Broad-spectrum antibiotic.' },
  usedFor: [{ en: 'Bacterial infections' }], commonSideEffects: [{ en: 'Nausea' }],
  whenToSeekHelp: { en: 'If rash develops' }, storageInstructions: { en: 'Store below 25°C' },
  pregnancySummaryPlain: { en: 'Category B' }, warningsSummaryPlain: { en: 'Allergy risk' },
  version: 1, lastUpdated: '2026-06-12T00:00:00Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getDrugRowByAtcCode as jest.Mock).mockResolvedValue({ tier1_json: JSON.stringify(tier1Entry), tier2_json: null, tier3_json: null })
  ;(scopeEntryForRole as jest.Mock).mockReturnValue(tier1Entry)
})

describe('DrugDetailScreen', () => {
  it('renders INN name after loading', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'PATIENT' }, isAuthenticated: true, initialized: true })
    const { findByText } = render(<DrugDetailScreen />)
    expect(await findByText('amoxicillin')).toBeTruthy()
  })

  it('does not render Clinical tab for PATIENT role', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'PATIENT' }, isAuthenticated: true, initialized: true })
    const { queryByText, findByText } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(queryByText('Clinical')).toBeNull()
  })

  it('renders Clinical tab for DOCTOR role', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'DOCTOR' }, isAuthenticated: true, initialized: true })
    const { findByText } = render(<DrugDetailScreen />)
    expect(await findByText('Clinical')).toBeTruthy()
  })

  it('renders Enrich tab for PHARMACIST role', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'PHARMACIST' }, isAuthenticated: true, initialized: true })
    const { findByText } = render(<DrugDetailScreen />)
    expect(await findByText('Enrich')).toBeTruthy()
  })
})
