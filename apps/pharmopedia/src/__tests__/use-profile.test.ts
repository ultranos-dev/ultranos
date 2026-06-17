import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react-native'
const h = vi.hoisted(() => ({ getProfile: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('@/api/users', () => ({ getProfile: h.getProfile }))
vi.mock('@/lib/profile-cache', () => ({ readProfileCache: h.read, writeProfileCache: h.write, clearProfileCache: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: string | null; user: { sub: string } | null }) => unknown) => s({ token: 'tok', user: { sub: 'auth-1' } }) }))
import { useProfile } from '@/hooks/useProfile'

const PAT = { kind: 'patient', displayName: 'Sara', givenName: 'Sara', tier: 'FREE' }
describe('useProfile', () => {
  beforeEach(() => vi.clearAllMocks())
  it('shows cache first, then network, and writes cache', async () => {
    h.read.mockResolvedValue({ ...PAT, displayName: 'Cached' })
    h.getProfile.mockResolvedValue(PAT)
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.source).toBe('network'))
    expect(result.current.profile).toEqual(PAT)
    expect(h.write).toHaveBeenCalledWith(expect.anything(), 'auth-1', PAT)
  })
  it('keeps cached profile when the network call fails', async () => {
    h.read.mockResolvedValue({ ...PAT, displayName: 'Cached' })
    h.getProfile.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile?.displayName).toBe('Cached')
    expect(result.current.source).toBe('cache')
  })
  it('source none when no cache and network fails', async () => {
    h.read.mockResolvedValue(null)
    h.getProfile.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile).toBeNull()
    expect(result.current.source).toBe('none')
  })
})
