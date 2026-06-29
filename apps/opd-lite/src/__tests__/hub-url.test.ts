import { describe, it, expect, afterEach, vi } from 'vitest'
import { getHubBaseUrl, getHubTrpcUrl } from '../lib/hub-url'

describe('hub-url', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to localhost:3004 (the hub-api dev port), never 3000', () => {
    vi.stubEnv('NEXT_PUBLIC_HUB_API_URL', '')
    expect(getHubBaseUrl()).toBe('http://localhost:3004')
    expect(getHubTrpcUrl()).toBe('http://localhost:3004/api/trpc')
  })

  it('uses NEXT_PUBLIC_HUB_API_URL when set (base form)', () => {
    vi.stubEnv('NEXT_PUBLIC_HUB_API_URL', 'https://hub.example.com')
    expect(getHubBaseUrl()).toBe('https://hub.example.com')
    expect(getHubTrpcUrl()).toBe('https://hub.example.com/api/trpc')
  })

  it('normalizes an env value that already includes /api/trpc', () => {
    vi.stubEnv('NEXT_PUBLIC_HUB_API_URL', 'https://hub.example.com/api/trpc')
    expect(getHubBaseUrl()).toBe('https://hub.example.com')
    expect(getHubTrpcUrl()).toBe('https://hub.example.com/api/trpc')
  })

  it('tolerates a trailing slash after /api/trpc', () => {
    vi.stubEnv('NEXT_PUBLIC_HUB_API_URL', 'https://hub.example.com/api/trpc/')
    expect(getHubTrpcUrl()).toBe('https://hub.example.com/api/trpc')
  })
})
