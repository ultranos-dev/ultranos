/**
 * drug-detail-rtl.test.tsx
 *
 * RTL snapshot tests for the DrugDetailScreen.
 * Snapshots in LTR (lang=en) and RTL (lang=ar) for a clinical role,
 * and asserts the clinical tab is present for clinical roles.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'

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
    summaryPlain: { en: 'Broad-spectrum antibiotic.', ar: 'مضاد حيوي واسع الطيف.' },
    usedFor: [{ en: 'Bacterial infections' }], commonSideEffects: [{ en: 'Nausea' }],
    whenToSeekHelp: { en: 'If rash develops' }, storageInstructions: { en: 'Store below 25°C' },
    pregnancySummaryPlain: { en: 'Category B' }, warningsSummaryPlain: { en: 'Allergy risk' },
    version: 1, lastUpdated: '2026-06-12T00:00:00Z',
    mechanismOfAction: 'Inhibits cell wall synthesis', indicationsClinical: [],
    adultDosing: [], pediatricDosing: [], renalAdjustment: undefined,
    adverseEvents: [], contraindications: [], interactions: [],
    pregnancyCategory: undefined, administrationNotes: {}, pharmacokinetics: {},
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
        'coach.detailBookmark': 'Bookmark this drug',
        'coach.detailTabs': 'Switch tabs',
      }[key] ?? key),
  }),
}))

// ── misc stubs ─────────────────────────────────────────────────────────────

vi.mock('@/lib/haptics', () => ({ hapticImpact: vi.fn() }))
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}))
vi.mock('@/components/DrugDetail/OverviewTab', () => ({ OverviewTab: () => null }))
vi.mock('@/components/DrugDetail/ClinicalTab', () => ({ ClinicalTab: () => null }))
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))
vi.mock('@/components/DrugDetail/EnrichTab', () => ({ EnrichTab: () => null }))
vi.mock('@/components/DrugDetail/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/components/DrugDetail/SafetyBanner', () => ({ SafetyBanner: () => null }))
vi.mock('@/components/SkeletonCard', () => ({ SkeletonCard: () => null }))
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
}))
vi.mock('@/components/CoachMark', () => ({ CoachMark: () => null }))

import DrugDetailScreen from '@/app/drug/[atcCode]'

describe('DrugDetailScreen — RTL snapshots', () => {
  it('LTR snapshot (lang=en)', async () => {
    mockLang.lang = 'en'
    const { toJSON, findByText } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(toJSON()).toMatchSnapshot()
  })

  it('RTL snapshot (lang=ar)', async () => {
    mockLang.lang = 'ar'
    const { toJSON, findByText } = render(<DrugDetailScreen />)
    // In RTL with ar localName present, it renders the Arabic name
    await findByText('أموكسيسيلين')
    expect(toJSON()).toMatchSnapshot()
  })

  it('tab-clinical testID is present for DOCTOR role', async () => {
    mockLang.lang = 'en'
    const { findByTestId } = render(<DrugDetailScreen />)
    expect(await findByTestId('tab-clinical')).toBeTruthy()
  })
})
