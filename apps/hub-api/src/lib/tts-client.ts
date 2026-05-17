/**
 * Story 24.2 Task 3: Cloud TTS Integration Client
 *
 * Configurable TTS API client via TTS_API_URL and TTS_API_KEY env vars.
 * Dialect-to-voice mapping is configurable per deployment geography.
 * On failure, returns { error: 'TTS_UNAVAILABLE' } — never throws.
 */

import type { TTSDialect } from './tts-prompt-builder'

export interface TTSSynthesisResult {
  audio: Buffer
  contentType: string
}

export interface TTSErrorResult {
  error: 'TTS_UNAVAILABLE'
}

export type TTSResult = TTSSynthesisResult | TTSErrorResult

export function isTTSError(result: TTSResult): result is TTSErrorResult {
  return 'error' in result
}

/**
 * Dialect-to-voice mapping.
 * These are placeholder voice IDs — real values depend on the TTS provider
 * (Google Cloud TTS, Azure Speech, or equivalent).
 */
const DIALECT_VOICE_MAP: Record<TTSDialect, string> = {
  AR_LEVANTINE: 'ar-XA-Wavenet-A',
  AR_GULF: 'ar-XA-Wavenet-B',
  DARI: 'fa-IR-Wavenet-A',
  EN: 'en-US-Wavenet-D',
}

const DIALECT_LANGUAGE_MAP: Record<TTSDialect, string> = {
  AR_LEVANTINE: 'ar-XA',
  AR_GULF: 'ar-XA',
  DARI: 'fa-IR',
  EN: 'en-US',
}

const TTS_TIMEOUT_MS = 10_000

/**
 * Synthesize speech from text using the configured Cloud TTS API.
 *
 * Output: MP3, 16kHz, mono (small file size for mobile).
 * Timeout: 10 seconds.
 * On any failure: returns { error: 'TTS_UNAVAILABLE' } — never throws.
 */
export async function synthesizeSpeech(
  text: string,
  dialect: TTSDialect,
): Promise<TTSResult> {
  const apiUrl = process.env.TTS_API_URL
  const apiKey = process.env.TTS_API_KEY

  if (!apiUrl || !apiKey) {
    return { error: 'TTS_UNAVAILABLE' }
  }

  const voice = DIALECT_VOICE_MAP[dialect] ?? DIALECT_VOICE_MAP.EN
  const languageCode = DIALECT_LANGUAGE_MAP[dialect] ?? DIALECT_LANGUAGE_MAP.EN

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode,
          name: voice,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          sampleRateHertz: 16000,
          effectsProfileId: ['handset-class-device'],
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { error: 'TTS_UNAVAILABLE' }
    }

    const data = await response.json()

    // Most TTS APIs return base64-encoded audio in audioContent field
    if (data.audioContent) {
      return {
        audio: Buffer.from(data.audioContent, 'base64'),
        contentType: 'audio/mpeg',
      }
    }

    return { error: 'TTS_UNAVAILABLE' }
  } catch {
    return { error: 'TTS_UNAVAILABLE' }
  }
}
