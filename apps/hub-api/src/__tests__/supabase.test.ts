import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

describe('Supabase client initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    // Clear env vars between tests
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('throws when SUPABASE_URL is missing', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    const { getSupabaseClient } = await import('../lib/supabase')

    expect(() => getSupabaseClient()).toThrow(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    )
  })

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    const { getSupabaseClient } = await import('../lib/supabase')

    expect(() => getSupabaseClient()).toThrow(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    )
  })

  it('creates client when both env vars are set', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    const { getSupabaseClient } = await import('../lib/supabase')
    const { createClient } = await import('@supabase/supabase-js')

    const client = getSupabaseClient()

    expect(client).toBeDefined()
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  })

  it('returns singleton on repeated calls', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    const { getSupabaseClient } = await import('../lib/supabase')

    const client1 = getSupabaseClient()
    const client2 = getSupabaseClient()

    expect(client1).toBe(client2)
  })
})
