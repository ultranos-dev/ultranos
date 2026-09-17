import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import BrowseTab from '@/app/(tabs)/browse'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surface: '#fff', border: '#e5e7eb', textPrimary: '#111', textMuted: '#9ca3af', surfaceSubtle: '#f3f4f6', primary500: '#2e9e71' }),
}))
vi.mock('@/hooks/useDrugSearch', () => ({ useDrugSearch: () => ({ query: '', results: [], brands: [], loading: false, search: vi.fn() }) }))

// Mutable browse db stubs so error/success can be toggled per-test.
const browseDb = vi.hoisted(() => ({
  classesReject: false,
  drugsReject: false,
  classes: [{ name: 'Antibacterials', count: 3 }] as { name: string; count: number }[],
  drugs: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [] as string[], doseForms: [] as string[], therapeuticClass: 'Antibacterials', localName: undefined }],
}))

vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: async () => {
    if (browseDb.classesReject) throw new Error('SQLite error')
    return browseDb.classes
  },
  getDrugsByTherapeuticClass: async () => {
    if (browseDb.drugsReject) throw new Error('SQLite error')
    return browseDb.drugs
  },
}))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

describe('BrowseTab', () => {
  beforeEach(() => {
    browseDb.classesReject = false
    browseDb.drugsReject = false
    browseDb.classes = [{ name: 'Antibacterials', count: 3 }]
    browseDb.drugs = [{ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'Antibacterials', localName: undefined }]
  })

  it('renders the title', async () => {
    const { findByText } = render(<BrowseTab />)
    expect(await findByText('tabs.browse')).toBeTruthy()
  })

  it('renders therapeutic class cards after loading', async () => {
    const { findByTestId } = render(<BrowseTab />)
    expect(await findByTestId('class-card-Antibacterials')).toBeTruthy()
  })

  it('pressing a class card shows the back button', async () => {
    const { findByTestId } = render(<BrowseTab />)
    const card = await findByTestId('class-card-Antibacterials')
    fireEvent.press(card)
    expect(await findByTestId('browse-back-btn')).toBeTruthy()
  })

  // ── 4-state: classes error ─────────────────────────────────────────────────

  it('shows unavailable message (not empty title) when class load fails', async () => {
    browseDb.classesReject = true
    const { findByTestId, queryByText } = render(<BrowseTab />)
    // The unavailable EmptyState renders instead of emptyTitle
    expect(await findByTestId('classes-unavailable')).toBeTruthy()
    expect(queryByText('browse.emptyTitle')).toBeNull()
  })

  // ── 4-state: drugs error ───────────────────────────────────────────────────

  it('shows unavailable message (not noDrugs) when drug load fails', async () => {
    browseDb.drugsReject = true
    const { findByTestId } = render(<BrowseTab />)
    const card = await findByTestId('class-card-Antibacterials')
    fireEvent.press(card)
    expect(await findByTestId('drugs-unavailable')).toBeTruthy()
  })

  it('does NOT show "noDrugs" text when drug load fails', async () => {
    browseDb.drugsReject = true
    const { findByTestId, queryByText } = render(<BrowseTab />)
    const card = await findByTestId('class-card-Antibacterials')
    fireEvent.press(card)
    await findByTestId('drugs-unavailable')
    expect(queryByText('browse.noDrugs')).toBeNull()
  })
})
