export interface TranscodeResult { blob: Blob; width: number; height: number; bytes: number; originalType: string }
export class TranscodeTooLargeError extends Error {}
export class TranscodeUnsupportedError extends Error {}

export const TRANSCODE = {
  MAX_IMAGE_EDGE_PX: 2048,
  TARGET_IMAGE_BYTES: 1_048_576,
  MIN_IMAGE_EDGE_PX: 1024,
  WEBP_QUALITY_LADDER: [0.9, 0.8, 0.7, 0.6, 0.5] as const,
}

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface Deps {
  decode: (file: File) => Promise<{ width: number; height: number }>
  encode: (edge: number, quality: number) => Promise<{ blob: Blob; bytes: number }>
}

function fitEdge(w: number, h: number, edge: number) {
  const longest = Math.max(w, h)
  if (longest <= edge) return { w, h }
  const scale = edge / longest
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

export async function transcodeToWebp(file: File, deps?: Deps): Promise<TranscodeResult> {
  if (!SUPPORTED.has(file.type)) {
    throw new TranscodeUnsupportedError(`unsupported type: ${file.type}`)
  }
  const d = deps ?? realDeps(file)
  const src = await d.decode(file)

  let edge = TRANSCODE.MAX_IMAGE_EDGE_PX
  while (edge >= TRANSCODE.MIN_IMAGE_EDGE_PX) {
    const dim = fitEdge(src.width, src.height, edge)
    const usedEdge = Math.max(dim.w, dim.h)
    for (const q of TRANSCODE.WEBP_QUALITY_LADDER) {
      const { blob, bytes } = await d.encode(usedEdge, q)
      if (bytes <= TRANSCODE.TARGET_IMAGE_BYTES) {
        return { blob, bytes, width: dim.w, height: dim.h, originalType: file.type }
      }
    }
    edge = Math.round(edge * 0.85)
  }
  throw new TranscodeTooLargeError('could not compress image under target size')
}

function realDeps(_file: File): Deps {
  return {
    async decode(file) {
      const bitmap = await createImageBitmap(file)
      return { width: bitmap.width, height: bitmap.height }
    },
    async encode(edge, quality) {
      const bitmap = await createImageBitmap(_file)
      const dim = fitEdge(bitmap.width, bitmap.height, edge)
      const canvas = new OffscreenCanvas(dim.w, dim.h)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, dim.w, dim.h)
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
      return { blob, bytes: blob.size }
    },
  }
}
