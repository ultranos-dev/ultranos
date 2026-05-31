import { MAX_PHOTO_WIDTH, MAX_PHOTO_SIZE } from './peer-network-types'
import type { PostPhoto } from './peer-network-types'

/**
 * Strip EXIF metadata from a JPEG/PNG by re-encoding through a canvas.
 * This removes GPS coordinates, device info, timestamps — critical for privacy.
 * Also compresses to max 800px width and converts to JPEG.
 */
export async function processPhoto(file: File): Promise<PostPhoto> {
  if (file.size > MAX_PHOTO_SIZE) {
    throw new Error(`Photo exceeds ${MAX_PHOTO_SIZE / (1024 * 1024)} MB limit`)
  }

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  let targetWidth = width
  let targetHeight = height

  if (width > MAX_PHOTO_WIDTH) {
    const ratio = MAX_PHOTO_WIDTH / width
    targetWidth = MAX_PHOTO_WIDTH
    targetHeight = Math.round(height * ratio)
  }

  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
  const buffer = await blob.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''),
  )

  return {
    id: crypto.randomUUID(),
    data: base64,
    mimeType: 'image/jpeg',
  }
}

/**
 * Validate that a file is an acceptable image type for the peer network.
 */
export function isValidPhotoType(file: File): boolean {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
}
