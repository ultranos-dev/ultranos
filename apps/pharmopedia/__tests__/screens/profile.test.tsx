import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import ProfileTab from '../../app/(tabs)/profile'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { runSync } from '@/sync/catalog-sync'

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { refreshSession: jest.fn() } },
}))
jest.mock('@/sync/catalog-sync', () => ({ runSync: jest.fn() }))
const mockDb = {
  withExclusiveTransactionAsync: jest.fn((cb: (txn: unknown) => Promise<void>) =>
    cb({ runAsync: jest.fn() })
  ),
  runAsync: jest.fn(),
}
jest.mock('@/db/migrations', () => ({ getDatabase: jest.fn(() => mockDb) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }))

const mockRunSync = runSync as jest.Mock

beforeEach(() => {
  useAuthStore.setState({
    token: 'tok', user: { sub: 'u1', role: 'DOCTOR' },
    isAuthenticated: true, initialized: true,
  })
  useSyncStore.setState({ status: 'idle', lastSyncAt: '2026-06-12T10:00:00Z', lastVersion: 5 })
  jest.clearAllMocks()
})

describe('ProfileTab', () => {
  it('renders role badge', () => {
    const { getByText } = render(<ProfileTab />)
    expect(getByText('DOCTOR')).toBeTruthy()
  })

  it('shows last synced timestamp', () => {
    const { getByTestId } = render(<ProfileTab />)
    expect(getByTestId('last-synced-text')).toBeTruthy()
  })

  it('calls runSync when Sync Now is pressed', async () => {
    mockRunSync.mockResolvedValueOnce({ synced: 3, version: 8 })
    const { getByTestId } = render(<ProfileTab />)
    fireEvent.press(getByTestId('sync-now-button'))
    await waitFor(() => expect(mockRunSync).toHaveBeenCalledTimes(1))
  })

  it('calls logout and wipes DB on logout press', async () => {
    const logoutSpy = jest.spyOn(useAuthStore.getState(), 'logout')
    const { getByTestId } = render(<ProfileTab />)
    fireEvent.press(getByTestId('logout-button'))
    await waitFor(() => expect(logoutSpy).toHaveBeenCalled())
  })
})
