import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import BrowseTab from '@/app/(tabs)/browse'

const { mockGetTherapeuticClasses, mockGetDrugsByTherapeuticClass } = vi.hoisted(() => ({
  mockGetTherapeuticClasses: vi.fn().mockResolvedValue([]),
  mockGetDrugsByTherapeuticClass: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: mockGetTherapeuticClasses,
  getDrugsByTherapeuticClass: mockGetDrugsByTherapeuticClass,
}))

vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn().mockReturnValue({}) }))
vi.mock('@/store/lang-store', () => ({
  useLangStore: (s: (state: { lang: string }) => unknown) => s({ lang: 'en' }),
  isRtlLang: () => false,
}))
vi.mock('@/store/sync-store', () => ({
  useSyncStore: (s: (state: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'browse.empty': 'No categories available',
        'browse.noDrugs': 'No drugs in this category',
        'common.back': 'Back',
      }
      return map[key] ?? key
    },
  }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const CLASSES = [
  { name: 'Antibacterials', count: 12 },
  { name: 'Analgesics', count: 8 },
]

const DRUGS = [
  { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'Antibacterials', localName: undefined },
]

describe('BrowseTab — class list', () => {
  beforeEach(() => {
    mockGetTherapeuticClasses.mockClear()
    mockGetDrugsByTherapeuticClass.mockClear()
  })

  it('shows empty state when no therapeutic classes available', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce([])
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByText('No categories available')).toBeTruthy())
  })

  it('renders a card for each therapeutic class', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce(CLASSES)
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    expect(screen.getByTestId('class-card-Analgesics')).toBeTruthy()
  })

  it('pressing a class loads and shows its drugs', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce(CLASSES)
    mockGetDrugsByTherapeuticClass.mockResolvedValueOnce(DRUGS)
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    fireEvent.press(screen.getByTestId('class-card-Antibacterials'))
    await waitFor(() => expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy())
    expect(mockGetDrugsByTherapeuticClass).toHaveBeenCalledWith({}, 'Antibacterials', 'en')
  })

  it('shows noDrugs empty state when getDrugsByTherapeuticClass rejects', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce(CLASSES)
    mockGetDrugsByTherapeuticClass.mockRejectedValueOnce(new Error('DB error'))
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    fireEvent.press(screen.getByTestId('class-card-Antibacterials'))
    await waitFor(() => expect(screen.getByText('No drugs in this category')).toBeTruthy())
  })

  it('pressing Back returns to the class list', async () => {
    mockGetTherapeuticClasses.mockResolvedValue(CLASSES)
    mockGetDrugsByTherapeuticClass.mockResolvedValueOnce(DRUGS)
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    fireEvent.press(screen.getByTestId('class-card-Antibacterials'))
    await waitFor(() => expect(screen.getByTestId('browse-back-btn')).toBeTruthy())
    fireEvent.press(screen.getByTestId('browse-back-btn'))
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
  })
})
