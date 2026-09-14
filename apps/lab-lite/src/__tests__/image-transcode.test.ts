import { describe, it, expect } from 'vitest'
import { transcodeToWebp, TranscodeUnsupportedError, TranscodeTooLargeError, TRANSCODE } from '../lib/image-transcode'

function makeDeps(bytesFor: (q: number, edge: number) => number) {
  return {
    decode: async (_file: File) => ({ width: 4000, height: 3000 }),
    encode: async (edge: number, quality: number) => {
      const bytes = bytesFor(quality, edge)
      return { blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), bytes }
    },
  }
}
function file(type: string) { return new File([new Uint8Array(10)], 'x', { type }) }

describe('transcodeToWebp', () => {
  it('rejects unsupported types (e.g. HEIC)', async () => {
    await expect(transcodeToWebp(file('image/heic'))).rejects.toBeInstanceOf(TranscodeUnsupportedError)
  })
  it('caps the longest edge at MAX_IMAGE_EDGE_PX and keeps aspect ratio', async () => {
    const deps = makeDeps(() => 500_000)
    const r = await transcodeToWebp(file('image/jpeg'), deps)
    expect(Math.max(r.width, r.height)).toBe(TRANSCODE.MAX_IMAGE_EDGE_PX)
    expect(r.width).toBe(2048)
    expect(r.height).toBe(1536)
    expect(r.bytes).toBeLessThanOrEqual(TRANSCODE.TARGET_IMAGE_BYTES)
  })
  it('walks the quality ladder until under target', async () => {
    const deps = makeDeps((q) => (q >= 0.8 ? 2_000_000 : 800_000))
    const r = await transcodeToWebp(file('image/png'), deps)
    expect(r.bytes).toBe(800_000)
  })
  it('downscales when the whole ladder is over target, then succeeds', async () => {
    const deps = makeDeps((_q, edge) => (edge > 1740 ? 2_000_000 : 900_000))
    const r = await transcodeToWebp(file('image/jpeg'), deps)
    expect(r.bytes).toBe(900_000)
    expect(Math.max(r.width, r.height)).toBeLessThan(2048)
  })
  it('throws TranscodeTooLargeError when unreachable', async () => {
    const deps = makeDeps(() => 5_000_000)
    await expect(transcodeToWebp(file('image/jpeg'), deps)).rejects.toBeInstanceOf(TranscodeTooLargeError)
  })
})
