import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { synthesizeSpeech, isTTSError } from '../lib/tts-client'

beforeEach(() => {
  vi.stubEnv('TTS_API_URL', 'https://tts.example.com/v1/synthesize')
  vi.stubEnv('TTS_API_KEY', 'test-api-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('synthesizeSpeech', () => {
  it('synthesizes audio and returns Buffer on success', async () => {
    const mockAudioContent = Buffer.from('mock-audio').toString('base64')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: mockAudioContent }),
    } as Response)

    const result = await synthesizeSpeech('Hello', 'EN')

    expect(isTTSError(result)).toBe(false)
    if (!isTTSError(result)) {
      expect(result.audio).toBeInstanceOf(Buffer)
      expect(result.contentType).toBe('audio/mpeg')
    }
  })

  it('returns TTS_UNAVAILABLE when env vars are missing', async () => {
    vi.stubEnv('TTS_API_URL', '')
    vi.stubEnv('TTS_API_KEY', '')

    const result = await synthesizeSpeech('Hello', 'EN')

    expect(isTTSError(result)).toBe(true)
    if (isTTSError(result)) {
      expect(result.error).toBe('TTS_UNAVAILABLE')
    }
  })

  it('returns TTS_UNAVAILABLE on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)

    const result = await synthesizeSpeech('Hello', 'EN')

    expect(isTTSError(result)).toBe(true)
  })

  it('returns TTS_UNAVAILABLE on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const result = await synthesizeSpeech('Hello', 'EN')

    expect(isTTSError(result)).toBe(true)
  })

  it('returns TTS_UNAVAILABLE on timeout (abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    const result = await synthesizeSpeech('Hello', 'AR_LEVANTINE')

    expect(isTTSError(result)).toBe(true)
  })

  it('sends correct dialect voice mapping in request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: Buffer.from('audio').toString('base64') }),
    } as Response)

    await synthesizeSpeech('مرحبا', 'AR_LEVANTINE')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(body.voice.languageCode).toBe('ar-XA')
    expect(body.voice.name).toBe('ar-XA-Wavenet-A')
    expect(body.audioConfig.audioEncoding).toBe('MP3')
    expect(body.audioConfig.sampleRateHertz).toBe(16000)
  })

  it('returns TTS_UNAVAILABLE when response lacks audioContent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ unexpectedField: 'value' }),
    } as Response)

    const result = await synthesizeSpeech('Hello', 'EN')

    expect(isTTSError(result)).toBe(true)
  })
})
