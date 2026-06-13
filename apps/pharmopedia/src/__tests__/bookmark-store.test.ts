import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddBookmark = vi.fn().mockResolvedValue(undefined)
const mockRemoveBookmark = vi.fn().mockResolvedValue(undefined)
const mockGetBookmarks = vi.fn().mockResolvedValue([])

vi.mock('@/db/bookmarks', () => ({
  addBookmark: mockAddBookmark,
  removeBookmark: mockRemoveBookmark,
  getBookmarks: mockGetBookmarks,
  clearBookmarks: vi.fn().mockResolvedValue(undefined),
}))

const mockDb = {} as import('expo-sqlite').SQLiteDatabase

const { useBookmarkStore } = await import('@/store/bookmark-store')

describe('bookmark-store: init', () => {
  beforeEach(() => {
    useBookmarkStore.setState({ bookmarkedAtcCodes: [], bookmarks: [], initialized: false })
    mockGetBookmarks.mockClear()
    mockGetBookmarks.mockResolvedValue([])
  })

  it('starts uninitialized with empty lists', () => {
    const s = useBookmarkStore.getState()
    expect(s.initialized).toBe(false)
    expect(s.bookmarks).toHaveLength(0)
    expect(s.bookmarkedAtcCodes).toHaveLength(0)
  })

  it('init() loads bookmarks from DB and sets initialized', async () => {
    mockGetBookmarks.mockResolvedValueOnce([
      { atc_code: 'J01CA04', inn_name: 'Amoxicillin', therapeutic_class: 'Antibacterials', saved_at: '2026-06-13T00:00:00.000Z' },
    ])
    await useBookmarkStore.getState().init(mockDb)
    const s = useBookmarkStore.getState()
    expect(s.initialized).toBe(true)
    expect(s.bookmarks).toHaveLength(1)
    expect(s.bookmarks[0]!.atcCode).toBe('J01CA04')
    expect(s.bookmarkedAtcCodes).toContain('J01CA04')
  })

  it('init() is idempotent — second call is a no-op', async () => {
    useBookmarkStore.setState({ initialized: true })
    await useBookmarkStore.getState().init(mockDb)
    expect(mockGetBookmarks).not.toHaveBeenCalled()
  })
})

describe('bookmark-store: isBookmarked', () => {
  beforeEach(() => {
    useBookmarkStore.setState({
      bookmarkedAtcCodes: ['J01CA04'],
      bookmarks: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials', savedAt: '2026-06-13T00:00:00.000Z' }],
      initialized: true,
    })
  })

  it('returns true for a bookmarked code', () => {
    expect(useBookmarkStore.getState().isBookmarked('J01CA04')).toBe(true)
  })

  it('returns false for a non-bookmarked code', () => {
    expect(useBookmarkStore.getState().isBookmarked('N02BE01')).toBe(false)
  })
})

describe('bookmark-store: toggle', () => {
  beforeEach(() => {
    useBookmarkStore.setState({ bookmarkedAtcCodes: [], bookmarks: [], initialized: true })
    mockAddBookmark.mockClear()
    mockRemoveBookmark.mockClear()
  })

  it('toggle adds a new bookmark and calls addBookmark', async () => {
    await useBookmarkStore.getState().toggle(mockDb, { atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials' })
    expect(mockAddBookmark).toHaveBeenCalledWith(mockDb, 'J01CA04', 'Amoxicillin', 'Antibacterials')
    const s = useBookmarkStore.getState()
    expect(s.bookmarkedAtcCodes).toContain('J01CA04')
    expect(s.bookmarks).toHaveLength(1)
  })

  it('toggle removes an existing bookmark and calls removeBookmark', async () => {
    useBookmarkStore.setState({
      bookmarkedAtcCodes: ['J01CA04'],
      bookmarks: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: null, savedAt: '2026-06-13T00:00:00.000Z' }],
      initialized: true,
    })
    await useBookmarkStore.getState().toggle(mockDb, { atcCode: 'J01CA04', innName: 'Amoxicillin' })
    expect(mockRemoveBookmark).toHaveBeenCalledWith(mockDb, 'J01CA04')
    const s = useBookmarkStore.getState()
    expect(s.bookmarkedAtcCodes).not.toContain('J01CA04')
    expect(s.bookmarks).toHaveLength(0)
  })
})

describe('bookmark-store: reset', () => {
  it('reset clears all state and unsets initialized', () => {
    useBookmarkStore.setState({
      bookmarkedAtcCodes: ['J01CA04'],
      bookmarks: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: null, savedAt: '2026-06-13T00:00:00.000Z' }],
      initialized: true,
    })
    useBookmarkStore.getState().reset()
    const s = useBookmarkStore.getState()
    expect(s.bookmarkedAtcCodes).toHaveLength(0)
    expect(s.bookmarks).toHaveLength(0)
    expect(s.initialized).toBe(false)
  })
})
