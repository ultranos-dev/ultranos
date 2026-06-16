/**
 * peer-network-photos.test.ts
 *
 * Tests for photo preprocessing in the peer network feature (Story 46.4).
 * OffscreenCanvas and createImageBitmap are not available in jsdom — mocked below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAX_PHOTO_SIZE } from '../lib/peer-network-types'
import { isValidPhotoType } from '../lib/peer-network-photos'

// ── OffscreenCanvas / createImageBitmap mocks ────────────────────────────────

const mockCtx = {
  drawImage: vi.fn(),
}

const mockBlob = (size: number, type = 'image/jpeg') =>
  Object.assign(new Blob(), { size, type })

const mockCanvas = {
  getContext: vi.fn(() => mockCtx),
  convertToBlob: vi.fn(),
}

vi.stubGlobal(
  'OffscreenCanvas',
  vi.fn(() => mockCanvas),
)

vi.stubGlobal('createImageBitmap', vi.fn())

// ── processPhoto tests ────────────────────────────────────────────────────────

describe('peer-network-photos — processPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects files over 10 MB pre-compression limit', async () => {
    const { processPhoto } = await import('../lib/peer-network-photos')
    const oversized = new File([], 'large.jpg', { type: 'image/jpeg' })
    Object.defineProperty(oversized, 'size', { value: 11 * 1024 * 1024 })

    await expect(processPhoto(oversized)).rejects.toThrow('10 MB limit before compression')
  })

  it('rejects output if compressed blob exceeds MAX_PHOTO_SIZE', async () => {
    const { processPhoto } = await import('../lib/peer-network-photos')

    const bitmap = { width: 400, height: 300, close: vi.fn() }
    ;(createImageBitmap as ReturnType<typeof vi.fn>).mockResolvedValue(bitmap)
    mockCanvas.convertToBlob.mockResolvedValue(mockBlob(MAX_PHOTO_SIZE + 1))

    const file = new File([], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: 500 * 1024 })

    await expect(processPhoto(file)).rejects.toThrow('Compressed photo exceeds')
  })

  it('accepts a file within limits and returns a PostPhoto', async () => {
    const { processPhoto } = await import('../lib/peer-network-photos')

    const bitmap = { width: 400, height: 300, close: vi.fn() }
    ;(createImageBitmap as ReturnType<typeof vi.fn>).mockResolvedValue(bitmap)

    // Small blob within MAX_PHOTO_SIZE
    const smallBlob = mockBlob(100 * 1024)
    mockCanvas.convertToBlob.mockResolvedValue(smallBlob)

    // arrayBuffer returns a buffer we can encode
    const buf = new ArrayBuffer(4)
    Object.defineProperty(smallBlob, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(buf),
    })

    const file = new File([], 'test.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: 500 * 1024 })

    const result = await processPhoto(file)

    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
    })
    expect(result.id).toBeDefined()
    expect(typeof result.data).toBe('string')
  })

  it('scales down images wider than MAX_PHOTO_WIDTH (800px)', async () => {
    const { processPhoto } = await import('../lib/peer-network-photos')

    const bitmap = { width: 1600, height: 900, close: vi.fn() }
    ;(createImageBitmap as ReturnType<typeof vi.fn>).mockResolvedValue(bitmap)

    const smallBlob = mockBlob(100 * 1024)
    mockCanvas.convertToBlob.mockResolvedValue(smallBlob)
    const buf = new ArrayBuffer(4)
    Object.defineProperty(smallBlob, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(buf),
    })

    const file = new File([], 'wide.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: 500 * 1024 })

    await processPhoto(file)

    // OffscreenCanvas should be constructed with scaled dimensions
    const OffscreenCanvasCtor = OffscreenCanvas as unknown as ReturnType<typeof vi.fn>
    expect(OffscreenCanvasCtor).toHaveBeenCalledWith(800, 450)
  })

  it('does not scale images at or below MAX_PHOTO_WIDTH', async () => {
    const { processPhoto } = await import('../lib/peer-network-photos')

    const bitmap = { width: 600, height: 400, close: vi.fn() }
    ;(createImageBitmap as ReturnType<typeof vi.fn>).mockResolvedValue(bitmap)

    const smallBlob = mockBlob(100 * 1024)
    mockCanvas.convertToBlob.mockResolvedValue(smallBlob)
    const buf = new ArrayBuffer(4)
    Object.defineProperty(smallBlob, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(buf),
    })

    const file = new File([], 'normal.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: 200 * 1024 })

    await processPhoto(file)

    const OffscreenCanvasCtor = OffscreenCanvas as unknown as ReturnType<typeof vi.fn>
    expect(OffscreenCanvasCtor).toHaveBeenCalledWith(600, 400)
  })
})

// ── isValidPhotoType tests ────────────────────────────────────────────────────

describe('peer-network-photos — isValidPhotoType', () => {
  it('accepts image/jpeg', () => {
    expect(isValidPhotoType(new File([], 'f.jpg', { type: 'image/jpeg' }))).toBe(true)
  })

  it('accepts image/png', () => {
    expect(isValidPhotoType(new File([], 'f.png', { type: 'image/png' }))).toBe(true)
  })

  it('accepts image/webp', () => {
    expect(isValidPhotoType(new File([], 'f.webp', { type: 'image/webp' }))).toBe(true)
  })

  it('rejects image/gif', () => {
    expect(isValidPhotoType(new File([], 'f.gif', { type: 'image/gif' }))).toBe(false)
  })

  it('rejects application/pdf', () => {
    expect(isValidPhotoType(new File([], 'f.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})
