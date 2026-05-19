/**
 * Registration API client tests — Story 27.10, Task 8.4
 */

// Mock hub-fetch
const mockHubFetch = jest.fn()
jest.mock('@/lib/hub-fetch', () => ({
  hubFetch: (...args: unknown[]) => mockHubFetch(...args),
}))

import { requestOtp, register } from '@/lib/registration-api'

describe('Registration API Client — Story 27.10', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('requestOtp', () => {
    it('calls Hub API and returns result on success', async () => {
      mockHubFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: { sent: true } } } }),
      })

      const result = await requestOtp('+971501234567')

      expect(result).toEqual({ sent: true })
      expect(mockHubFetch).toHaveBeenCalledWith(
        expect.stringContaining('patientRegistration.requestOtp'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ json: { phone: '+971501234567' } }),
        }),
      )
    })

    it('throws on network error', async () => {
      mockHubFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })

      await expect(requestOtp('+971501234567')).rejects.toThrow(
        'Network error',
      )
    })
  })

  describe('register', () => {
    const validInput = {
      phone: '+971501234567',
      otpCode: '123456',
      firstName: 'Ahmad',
      dateOfBirth: '1990-01-15',
      preferredLanguage: 'ar',
    }

    it('returns patientId and session on success', async () => {
      const mockResult = {
        success: true,
        patientId: 'p-123',
        session: { accessToken: 'at', refreshToken: 'rt', expiresAt: 9999 },
      }
      mockHubFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: { json: mockResult } } }),
      })

      const result = await register(validInput)

      expect(result.success).toBe(true)
      expect(result.patientId).toBe('p-123')
      expect(result.session.accessToken).toBe('at')
    })

    it('throws error message from server on failure', async () => {
      mockHubFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { json: { message: 'Registration failed. Please try again.' } },
        }),
      })

      await expect(register(validInput)).rejects.toThrow(
        'Registration failed. Please try again.',
      )
    })

    it('handles network error gracefully', async () => {
      mockHubFetch.mockRejectedValueOnce(new Error('Network request failed'))

      await expect(register(validInput)).rejects.toThrow('Network request failed')
    })
  })
})
