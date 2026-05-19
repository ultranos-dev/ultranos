/**
 * Story 24.2: TTS API client for Patient Lite Mobile.
 *
 * Calls Hub API to generate dialect-tuned prescription audio.
 * Also handles playback completion logging (fire-and-forget).
 *
 * Uses hubFetch for certificate-pinned connections (Story 21.5 AC#3).
 */
import { hubFetch } from '@/lib/hub-fetch'

function getHubApiUrl(): string {
  return process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

export interface GenerateAudioResult {
  audioUrl: string
  expiresAt: string
  duration: number | null
  dialect: string
}

export interface GenerateAudioError {
  error: string
}

/**
 * Request TTS audio generation from Hub API.
 * Returns the pre-signed audio URL or an error.
 */
export async function generatePrescriptionAudio(
  medicationRequestId: string,
  dialect: 'AR_LEVANTINE' | 'AR_GULF' | 'DARI' | 'EN',
  patientId: string,
  token?: string,
): Promise<GenerateAudioResult> {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.generatePrescriptionAudio'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await hubFetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: { medicationRequestId, dialect, patientId } }),
  })

  if (!res.ok) {
    throw new Error('TTS_UNAVAILABLE')
  }

  const body = await res.json() as { result: { data: { json: GenerateAudioResult } } }
  return body.result.data.json
}

/**
 * Log TTS playback completion to Hub API.
 * Fire-and-forget — never blocks UI or throws on failure.
 */
export function logPlaybackCompletion(
  medicationRequestId: string,
  patientId: string,
  dialect: 'AR_LEVANTINE' | 'AR_GULF' | 'DARI' | 'EN',
  source: 'CLOUD_TTS' | 'OFFLINE_FRAGMENT',
  token?: string,
): void {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.logTTSPlayback'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Fire-and-forget: don't await, don't throw
  hubFetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      json: {
        medicationRequestId,
        patientId,
        dialect,
        source,
        completedAt: new Date().toISOString(),
      },
    }),
  }).catch(() => {
    // Silently drop — AC: playback must never be blocked by logging
  })
}
