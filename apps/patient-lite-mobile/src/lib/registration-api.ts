/**
 * Registration API client — Hub API integration for patient self-registration.
 *
 * Story 27.10, Task 7: API client for registration endpoints.
 *
 * Uses hubFetch for certificate-pinned requests.
 * Registration requires connectivity — cannot register offline.
 *
 * CLAUDE.md Rule #1: No PHI in logs. Phone numbers never logged.
 */
import { hubFetch } from '@/lib/hub-fetch'

const HUB_API_URL = process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'

export interface RegistrationInput {
  phone: string
  otpCode: string
  firstName: string
  dateOfBirth: string
  preferredLanguage: string
}

export interface RegistrationResult {
  success: boolean
  patientId: string
  session: {
    accessToken: string
    refreshToken: string
    expiresAt: number
  }
}

/**
 * Request OTP for patient registration.
 * Always returns { sent: true } regardless of whether phone exists (anti-enumeration).
 */
export async function requestOtp(phone: string): Promise<{ sent: boolean }> {
  const res = await hubFetch(`${HUB_API_URL}/patientRegistration.requestOtp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { phone } }),
  })

  if (!res.ok) {
    throw new Error('Network error — please check your connection and try again.')
  }

  const body = (await res.json()) as {
    result: { data: { json: { sent: boolean } } }
  }
  return body.result.data.json
}

/**
 * Complete patient registration with OTP verification and profile data.
 * Creates FHIR Patient with FREE tier, returns session tokens.
 */
export async function register(input: RegistrationInput): Promise<RegistrationResult> {
  const res = await hubFetch(`${HUB_API_URL}/patientRegistration.register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)
    const message = (errorBody as { error?: { json?: { message?: string } } })?.error?.json?.message
    throw new Error(message ?? 'Registration failed. Please try again.')
  }

  const body = (await res.json()) as {
    result: { data: { json: RegistrationResult } }
  }
  return body.result.data.json
}
