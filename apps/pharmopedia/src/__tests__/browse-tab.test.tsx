import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import BrowseTab from '@/app/(tabs)/browse'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surface: '#fff', border: '#e5e7eb', textPrimary: '#111', textMuted: '#9ca3af', surfaceSubtle: '#f3f4f6', primary500: '#2e9e71' }),
}))
vi.mock('@/hooks/useDrugSearch', () => ({ useDrugSearch: () => ({ query: '', results: [], loading: false, search: vi.fn() }) }))
vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: async () => [{ name: 'Antibacterials', count: 3 }],
  getDrugsByTherapeuticClass: async () => [{ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'Antibacterials', localName: undefined }],
}))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

describe('BrowseTab', () => {
  beforeEach(() => {})

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
})
