/**
 * Tests for the database unlock flow on app startup.
 *
 * Verifies:
 * - AC4: Unlocking database requires biometric authentication
 * - Background re-lock after 3 minutes
 * - Unlock token pattern (D4 resolution)
 */

jest.mock('@/lib/mobile-key-service')
jest.mock('@/lib/encrypted-db')

let mockAppStateCallback: ((state: string) => void) | null = null
const mockRemove = jest.fn()

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn().mockImplementation(
      (_event: string, callback: (state: string) => void) => {
        mockAppStateCallback = callback
        return { remove: mockRemove }
      },
    ),
  },
  Platform: { OS: 'ios' },
}))

import { unlockWithBiometrics } from '@/lib/mobile-key-service'
import { getEncryptedDbConnection, closeDatabase, isDatabaseOpen, markAuthenticated } from '@/lib/encrypted-db'
import { AppState } from 'react-native'
import { renderHook, act } from '@testing-library/react-native'
import { useDatabaseUnlock } from '@/hooks/use-database-unlock'

const MOCK_TOKEN = 'dd'.repeat(32)
const mockedUnlock = unlockWithBiometrics as jest.MockedFunction<typeof unlockWithBiometrics>
const mockedGetDb = getEncryptedDbConnection as jest.MockedFunction<typeof getEncryptedDbConnection>
const mockedCloseDb = closeDatabase as jest.MockedFunction<typeof closeDatabase>
const mockedIsOpen = isDatabaseOpen as jest.MockedFunction<typeof isDatabaseOpen>
const mockedMarkAuth = markAuthenticated as jest.MockedFunction<typeof markAuthenticated>

describe('useDatabaseUnlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAppStateCallback = null
    mockedIsOpen.mockReturnValue(false)
    mockedUnlock.mockResolvedValue({ success: true, unlockToken: MOCK_TOKEN })
    mockedGetDb.mockResolvedValue({} as any)
    mockedCloseDb.mockResolvedValue()
  })

  it('starts in locked state', () => {
    const { result } = renderHook(() => useDatabaseUnlock())
    expect(result.current.isUnlocked).toBe(false)
    expect(result.current.isUnlocking).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('unlock() calls biometric authentication, marks auth with token, and opens db', async () => {
    const { result } = renderHook(() => useDatabaseUnlock())

    await act(async () => {
      await result.current.unlock()
    })

    expect(mockedUnlock).toHaveBeenCalled()
    expect(mockedMarkAuth).toHaveBeenCalledWith(MOCK_TOKEN)
    expect(mockedGetDb).toHaveBeenCalled()
    expect(result.current.isUnlocked).toBe(true)
    expect(result.current.isUnlocking).toBe(false)
  })

  it('sets error when biometric auth is cancelled', async () => {
    mockedUnlock.mockResolvedValue({ success: false, reason: 'cancelled' })

    const { result } = renderHook(() => useDatabaseUnlock())

    await act(async () => {
      await result.current.unlock()
    })

    expect(result.current.isUnlocked).toBe(false)
    expect(result.current.error).toBe('cancelled')
  })

  it('sets error when no security is available', async () => {
    mockedUnlock.mockResolvedValue({ success: false, reason: 'not-available' })

    const { result } = renderHook(() => useDatabaseUnlock())

    await act(async () => {
      await result.current.unlock()
    })

    expect(result.current.isUnlocked).toBe(false)
    expect(result.current.error).toBe('not-available')
  })

  it('lock() closes the database and handles errors gracefully', async () => {
    const { result } = renderHook(() => useDatabaseUnlock())

    await act(async () => {
      await result.current.unlock()
    })
    expect(result.current.isUnlocked).toBe(true)

    await act(async () => {
      await result.current.lock()
    })
    expect(mockedCloseDb).toHaveBeenCalled()
    expect(result.current.isUnlocked).toBe(false)
  })

  it('lock() does not throw if closeDatabase fails', async () => {
    mockedCloseDb.mockRejectedValueOnce(new Error('close failed'))

    const { result } = renderHook(() => useDatabaseUnlock())

    await act(async () => {
      await result.current.unlock()
    })

    await act(async () => {
      await result.current.lock() // should not throw
    })
    expect(result.current.isUnlocked).toBe(false)
  })

  it('sets error on unexpected exception', async () => {
    mockedUnlock.mockRejectedValue(new Error('hardware failure'))

    const { result } = renderHook(() => useDatabaseUnlock())

    await act(async () => {
      await result.current.unlock()
    })

    expect(result.current.isUnlocked).toBe(false)
    expect(result.current.error).toBe('failed')
  })

  it('registers AppState listener for background re-lock', () => {
    renderHook(() => useDatabaseUnlock())
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('cleans up AppState listener on unmount', () => {
    const { unmount } = renderHook(() => useDatabaseUnlock())
    unmount()
    expect(mockRemove).toHaveBeenCalled()
  })

  it('locks database when returning from >3min background', async () => {
    mockedIsOpen.mockReturnValue(true)

    const { result } = renderHook(() => useDatabaseUnlock())

    // Unlock first
    await act(async () => {
      await result.current.unlock()
    })
    expect(result.current.isUnlocked).toBe(true)

    // Simulate going to background
    const now = Date.now()
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(now) // background timestamp
      .mockReturnValue(now + 4 * 60 * 1000) // 4 minutes later

    await act(async () => {
      mockAppStateCallback?.('background')
    })

    // Simulate returning to foreground after 4 minutes
    await act(async () => {
      mockAppStateCallback?.('active')
    })

    expect(mockedCloseDb).toHaveBeenCalled()
    expect(result.current.isUnlocked).toBe(false)

    jest.spyOn(Date, 'now').mockRestore()
  })
})
