// Generic supabase mock — keeps the @/lib/supabase import from blowing up in tests
const mockSession = { access_token: 'mock-token', user: { id: 'mock-user-id' } }

const supabase = {
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
    onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    signInWithOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    verifyOtp: jest.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
}

// Named export used by useSessionExpiry and others.
const clearAuthTokens = jest.fn().mockResolvedValue(undefined)

module.exports = { supabase, clearAuthTokens }
