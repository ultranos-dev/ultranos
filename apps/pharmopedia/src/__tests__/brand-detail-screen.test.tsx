import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import type { DrugBrandDetail } from '@ultranos/shared-types'

const push = vi.fn()
const detail = vi.hoisted(() => ({ value: null as DrugBrandDetail | null }))
const genericRow = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'b1' }), useRouter: () => ({ push, back: vi.fn() }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { user: { role: string } }) => unknown) => s({ user: { role: 'PATIENT' } }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f5f5f5', borderSubtle: '#eee', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary50: '#edfaf4', primary100: '#d0f3e5', primary500: '#2e9e71', primary600: '#237d5a', primary700: '#1c6248' }) }))
vi.mock('@/store/bookmark-store', () => ({ useBookmarkStore: (sel: (s: { isBrandBookmarked: () => boolean; toggleBrand: () => void }) => unknown) => sel({ isBrandBookmarked: () => false, toggleBrand: vi.fn() }) }))
vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/db/brands', () => ({ getBrandDetail: vi.fn(async () => detail.value) }))
vi.mock('@/db/drug-catalog', () => ({ getDrugRowByAtcCode: vi.fn(async () => genericRow.value), scopeEntryForRole: vi.fn((row: unknown) => row) }))
vi.mock('@/components/DrugDetail/SafetyZone', () => ({ SafetyZone: () => null }))
vi.mock('@/components/DrugDetail/drug-detail-sections', () => ({ buildDrugSections: () => [{ id: 'clinical', title: 'Clinical', defaultOpen: false, body: null }] }))
vi.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/SkeletonCard', () => { const { View } = require('react-native'); return { SkeletonCard: () => require('react').createElement(View) } })
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react'); const { View, Pressable, Text } = require('react-native')
  return {
    Card: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    Chip: ({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) =>
      React.createElement(Pressable, { testID, onPress }, React.createElement(Text, null, label)),
    CollapsibleSection: ({ children, testID }: { children: React.ReactNode; testID?: string }) => React.createElement(View, { testID }, children),
  }
})

import BrandDetailScreen from '@/app/brand/[id]'

const DETAIL: DrugBrandDetail = {
  id: 'b1', brandName: 'SNOCIP', manufacturer: 'Snow Pharma', rxStatus: 'rx',
  genericAtcCode: 'J01MA02', genericInnName: 'Ciprofloxacin',
  presentations: [{ id: 'p1', brandId: 'b1', strength: '500mg', doseForm: 'tablet', packSize: 10, packUnit: 'tablets', referencePrice: 83.3, currency: 'AFN', registrationStatus: 'marketed', version: 1, lastUpdated: '' }],
  siblings: [{ id: 'b2', brandName: 'Cipromin', manufacturer: 'Afghan Medicine' }],
}

describe('BrandDetailScreen', () => {
  beforeEach(() => { push.mockClear(); detail.value = DETAIL; genericRow.value = null })

  it('renders brand name, manufacturer, presentation and generic link', async () => {
    const { findByTestId, getByText } = render(<BrandDetailScreen />)
    expect((await findByTestId('brand-name')).props.children).toBe('SNOCIP')
    expect(getByText('Snow Pharma')).toBeTruthy()
    expect(await findByTestId('presentation-p1')).toBeTruthy()
    expect(getByText('Ciprofloxacin')).toBeTruthy()
  })

  it('navigates to the generic on tapping the generic link', async () => {
    const { findByTestId } = render(<BrandDetailScreen />)
    fireEvent.press(await findByTestId('brand-generic-link'))
    expect(push).toHaveBeenCalledWith('/drug/J01MA02')
  })

  it('navigates to a sibling brand', async () => {
    const { findByTestId } = render(<BrandDetailScreen />)
    fireEvent.press(await findByTestId('sibling-b2'))
    expect(push).toHaveBeenCalledWith({ pathname: '/brand/[id]', params: { id: 'b2' } })
  })

  it('embeds the generic clinical sections + attribution when the generic is available', async () => {
    genericRow.value = { atcCode: 'J01MA02', innName: 'Ciprofloxacin', brandNames: [], doseForms: [], therapeuticClass: '' }
    const { findByTestId, getByText } = render(<BrandDetailScreen />)
    expect(await findByTestId('section-clinical')).toBeTruthy()       // generic's section embedded (edge-to-edge)
    expect(getByText(/clinicalFrom Ciprofloxacin/)).toBeTruthy()
  })

  it('shows not-found when the brand is missing', async () => {
    detail.value = null
    const { findByText } = render(<BrandDetailScreen />)
    expect(await findByText('brandDetail.notFound')).toBeTruthy()
  })
})
