'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { encryptBlob } from '@/lib/consent-crypto'

const CANVAS_CSS_SIZE = 200
const CANVAS_DPR = 2
const CANVAS_SIZE = CANVAS_CSS_SIZE * CANVAS_DPR
const STROKE_WIDTH = 3 * CANVAS_DPR
const MIN_COVERAGE = 0.05 // 5% pixel coverage required
const CENTER_CROP = 0.8 // analyze center 80% area

export interface ThumbprintCaptureProps {
  onCaptureComplete: (encryptedBlob: Blob) => void
}

function getPixelCoverage(ctx: CanvasRenderingContext2D): number {
  const offset = Math.floor(CANVAS_SIZE * (1 - CENTER_CROP) / 2)
  const size = Math.floor(CANVAS_SIZE * CENTER_CROP)
  const imageData = ctx.getImageData(offset, offset, size, size)
  const data = imageData.data
  let litPixels = 0
  const totalPixels = size * size

  // Check alpha channel — background is dark, strokes are white
  for (let i = 3; i < data.length; i += 4) {
    // A white stroke on dark background — check if pixel differs from background
    const r = data[i - 3]!
    const g = data[i - 2]!
    const b = data[i - 1]!
    if (r > 128 || g > 128 || b > 128) {
      litPixels++
    }
  }

  return litPixels / totalPixels
}

export function ThumbprintCapture({ onCaptureComplete }: ThumbprintCaptureProps) {
  const t = useTranslations('consent')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const [captured, setCaptured] = useState(false)
  const [tooLight, setTooLight] = useState(false)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE

    ctx.fillStyle = '#374151' // dark grey background
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = STROKE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  const getPos = useCallback((e: React.TouchEvent | React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()

    let clientX: number
    let clientY: number

    if ('touches' in e) {
      const touch = e.touches[0]
      if (!touch) return null
      clientX = touch.clientX
      clientY = touch.clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: (clientX - rect.left) * CANVAS_DPR * (CANVAS_CSS_SIZE / rect.width),
      y: (clientY - rect.top) * CANVAS_DPR * (CANVAS_CSS_SIZE / rect.height),
    }
  }, [])

  const handleStart = useCallback((e: React.TouchEvent | React.PointerEvent) => {
    e.preventDefault()
    isDrawingRef.current = true
    setTooLight(false)
    setCaptured(false)

    const pos = getPos(e)
    if (!pos) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const handleMove = useCallback((e: React.TouchEvent | React.PointerEvent) => {
    if (!isDrawingRef.current) return
    e.preventDefault()

    const pos = getPos(e)
    if (!pos) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [getPos])

  const handleEnd = useCallback(() => {
    isDrawingRef.current = false
  }, [])

  const handleClear = useCallback(() => {
    setCaptured(false)
    setTooLight(false)
    initCanvas()
  }, [initCanvas])

  const handleCapture = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const coverage = getPixelCoverage(ctx)
    if (coverage < MIN_COVERAGE) {
      setTooLight(true)
      return
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const encrypted = await encryptBlob(blob)
      onCaptureComplete(encrypted)
      setCaptured(true)
    }, 'image/png')
  }, [onCaptureComplete])

  if (captured) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600 dark:text-green-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm font-medium">{t('thumbprint.captured')}</p>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {t('thumbprint.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('thumbprint.instruction')}</p>

      <canvas
        ref={canvasRef}
        style={{ width: CANVAS_CSS_SIZE, height: CANVAS_CSS_SIZE }}
        className="touch-none rounded-lg border-2 border-gray-300 dark:border-gray-600"
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onPointerDown={handleStart}
        onPointerMove={handleMove}
        onPointerUp={handleEnd}
      />

      {tooLight && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{t('thumbprint.tooLight')}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {t('thumbprint.clear')}
        </button>
        <button
          type="button"
          onClick={handleCapture}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          {t('thumbprint.capture')}
        </button>
      </div>
    </div>
  )
}
