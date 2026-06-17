import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react-native'
const h = vi.hoisted(() => ({ getProfile: vi.fn(), read: vi.fn(), write: vi.fn(), getUser: vi.fn() }))
vi.mock('@/api/users', () => ({ getProfile: h.getProfile }))
vi.mock('@/lib/profile-cache', () => ({ readProfileCache: h.read, writeProfileCache: h.write, clearProfileCache: vi.fn() }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: string | null; user: { sub: string; role: string } | null }) => unknown) => s({ token: 'tok', user: { sub: 'auth-1', role: 'PATIENT' } }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: h.getUser } } }))
import { useProfile } from '@/hooks/useProfile'

const PAT = { kind: 'patient', displayName: 'Sara', givenName: 'Sara', tier: 'FREE' }
describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no session user, so the fallback yields nothing unless a test overrides it.
    h.getUser.mockResolvedValue({ data: { user: null } })
  })
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
  it('source none when no cache, no session, and network fails', async () => {
    h.read.mockResolvedValue(null)
    h.getProfile.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile).toBeNull()
    expect(result.current.source).toBe('none')
  })
  it('falls back to session metadata when the Hub is unavailable', async () => {
    h.read.mockResolvedValue(null)
    h.getProfile.mockRejectedValue(new Error('offline'))
    h.getUser.mockResolvedValue({ data: { user: { phone: '+93700000000', user_metadata: { given_name: 'Sara', family_name: 'Ahmadi', address: { province: 'Kabul' } } } } })
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.source).toBe('session'))
    expect(result.current.profile?.displayName).toBe('Sara Ahmadi')
    expect(result.current.profile?.phone).toBe('+93700000000')
  })
  it('falls back to session metadata when the Hub returns an empty shell', async () => {
    h.read.mockResolvedValue(null)
    h.getProfile.mockResolvedValue({ kind: 'patient', displayName: '', givenName: '', tier: 'FREE' })
    h.getUser.mockResolvedValue({ data: { user: { phone: '+93700000000', user_metadata: { given_name: 'Sara', family_name: 'Ahmadi' } } } })
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.source).toBe('session'))
    expect(result.current.profile?.displayName).toBe('Sara Ahmadi')
  })
})
