/**
 * drug-detail-rtl.test.tsx
 *
 * RTL snapshot tests for the DrugDetailScreen (single-scroll collapsible layout).
 * Asserts pinned SafetyZone is present, no tab bar nodes, and LTR/RTL snapshots.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'

// ── lang store — mutable so tests can override ─────────────────────────────

const mockLang = { lang: 'en', setLang: vi.fn() }

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: typeof mockLang) => unknown) => sel(mockLang),
  isRtlLang: (lang: string) => lang === 'ar',
}))

// ── auth store ─────────────────────────────────────────────────────────────

vi.mock('@/store/auth-store', () => {
  const state = { token: 'tok', user: { sub: 'u1', role: 'DOCTOR' }, isAuthenticated: true, initialized: true }
  return { useAuthStore: (sel?: (s: typeof state) => unknown) => sel ? sel(state) : state }
})

// ── bookmark store ─────────────────────────────────────────────────────────

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ isBookmarked: () => false, toggle: vi.fn() }),
}))

// ── db / api ───────────────────────────────────────────────────────────────

vi.mock('@/db/drug-catalog', () => {
  const entry = {
    atcCode: 'J01CA04', innName: 'amoxicillin', brandNames: ['Augmentin'],
    doseForms: ['tablet'], therapeuticClass: 'Antibiotic',
    localNames: { ar: 'أموكسيسيلين' },
    images: [{ url: 'https://x/advil.jpg', brand: 'Advil', isPrimary: true }],
    summaryPlain: { en: 'Broad-spectrum antibiotic.', ar: 'مضاد حيوي واسع الطيف.' },
    usedFor: [{ en: 'Bacterial infections' }], commonSideEffects: [{ en: 'Nausea' }],
    whenToSeekHelp: { en: 'If rash develops' }, storageInstructions: { en: 'Store below 25°C' },
    pregnancySummaryPlain: { en: 'Category B' }, warningsSummaryPlain: { en: 'May cause stomach bleeding' },
    version: 1, lastUpdated: '2026-06-12T00:00:00Z',
    mechanismOfAction: 'Inhibits cell wall synthesis', indicationsClinical: [],
    adultDosing: [], pediatricDosing: [], renalAdjustment: undefined,
    adverseEvents: [], contraindications: [], interactions: [],
    pregnancyClinical: undefined, administrationNotes: {}, pharmacokinetics: {},
  }
  return {
    getDrugRowByAtcCode: vi.fn().mockResolvedValue({
      tier1_json: JSON.stringify(entry),
      tier2_json: JSON.stringify(entry),
      tier3_json: null,
    }),
    scopeEntryForRole: vi.fn().mockReturnValue(entry),
  }
})

vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn().mockReturnValue({}) }))

vi.mock('@/api/drug-catalog', () => ({ getDrugByAtcCodeApi: vi.fn() }))

// ── expo-router ────────────────────────────────────────────────────────────

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ atcCode: 'J01CA04' }),
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}))

// ── safe-area ──────────────────────────────────────────────────────────────

vi.mock('react-native-safe-area-context', () => {
  const React = require('react')
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode; [k: string]: unknown }) =>
      React.createElement('SafeAreaView', props, children),
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  }
})

// ── theme colors ───────────────────────────────────────────────────────────

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff',
    surfaceSubtle: '#f5f5f5',
    textPrimary: '#141c28',
    textSecondary: '#4a5568',
    textMuted: '#838e9d',
    primary500: '#2e9e71',
    white: '#fff',
    border: '#d8dde6',
    danger: '#dc2626',
    dangerLight: '#fef2f2',
    dangerDark: '#991b1b',
    warning: '#d97706',
    warningLight: '#fffbeb',
    warningDark: '#92400e',
    success: '#16a34a',
    successLight: '#f0fdf4',
    successDark: '#14532d',
  }),
}))

// ── i18n ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'drug.tabs.overview': 'Overview',
        'drug.tabs.clinical': 'Clinical',
        'drug.tabs.pricing': 'Pricing',
        'drug.tabs.enrich': 'Enrich',
        'drug.notFound': 'Drug not found',
        'drug.notFoundDescription': 'We could not find this drug.',
        'drug.searchInstead': 'Search instead',
      }[key] ?? key),
  }),
}))

// ── misc stubs ─────────────────────────────────────────────────────────────

vi.mock('@/lib/haptics', () => ({ hapticImpact: vi.fn() }))
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}))
vi.mock('expo-image', () => { const R = require('react'); return { Image: (p: Record<string, unknown>) => R.createElement('ExpoImage', p) } })
vi.mock('@/components/DrugDetail/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/components/DrugDetail/SafetyZone', () => {
  const R = require('react')
  return { SafetyZone: () => R.createElement('View', { testID: 'safety-zone' }) }
})
vi.mock('@/components/DrugDetail/DrugThumbnail', () => {
  const R = require('react')
  return { DrugThumbnail: () => R.createElement('View', { testID: 'drug-thumbnail' }) }
})
vi.mock('@/components/DrugDetail/drug-detail-sections', () => ({
  buildDrugSections: () => [
    { id: 'summary', title: 'Summary', defaultOpen: true, body: null },
  ],
}))
vi.mock('@/components/SkeletonCard', () => ({ SkeletonCard: () => null }))
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
}))
vi.mock('@ultranos/ui-kit/native', () => {
  const R = require('react')
  return {
    CollapsibleSection: ({ children, testID, title }: { children?: React.ReactNode; testID?: string; title?: string }) =>
      R.createElement('View', { testID }, R.createElement('View', null, title), children),
    Chip: ({ label }: { label?: string }) => R.createElement('View', null, label),
  }
})

import DrugDetailScreen from '@/app/drug/[atcCode]'

describe('DrugDetailScreen — single scroll', () => {
  it('renders the pinned safety zone and a collapsible section, no tab bar', async () => {
    mockLang.lang = 'en'
    const { findByText, queryByTestId } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(queryByTestId('safety-zone')).toBeTruthy()
    expect(queryByTestId('tab-overview')).toBeNull() // tabs removed
  })

  it('LTR snapshot', async () => {
    mockLang.lang = 'en'
    const { toJSON, findByText } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(toJSON()).toMatchSnapshot()
  })

  it('RTL snapshot (lang=ar)', async () => {
    mockLang.lang = 'ar'
    const { toJSON, findByText } = render(<DrugDetailScreen />)
    await findByText('أموكسيسيلين')
    expect(toJSON()).toMatchSnapshot()
  })
})
