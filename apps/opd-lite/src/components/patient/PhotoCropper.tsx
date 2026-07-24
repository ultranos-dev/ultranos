'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ZoomIn, ZoomOut, AlertCircle } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

// ── Constants (verbatim from prior PhotoCropModal) ─────────────────────────────
const MAX_BYTES = 1024 * 1024     // 1 MB
const VIEWPORT = 300               // crop viewport px (square)
const FRAME = 240                  // inner crop frame px
const MARGIN = (VIEWPORT - FRAME) / 2  // = 30px on each side
const OUTPUT = 512                 // output canvas size px
const MAX_ZOOM = 5
const CORNER = 18                  // corner bracket length px

// ── Types ─────────────────────────────────────────────────────────────────────

interface Transform {
  zoom: number
  panX: number
  panY: number
}

export interface PhotoCropperHandle { crop: () => void }

interface PhotoCropperProps {
  rawDataUrl: string | null
  onCropped: (dataUrl: string) => void
  /**
   * Visual crop guide. The exported canvas is ALWAYS a square (OUTPUT×OUTPUT);
   * `'circle'` only swaps the on-screen mask for a round one so an avatar crop
   * reads true to its circular display. Registration keeps the default square.
   */
  shape?: 'square' | 'circle'
}

// ── Helper: clamp pan so image always fills the crop frame ───────────────────

function clampPan(panX: number, panY: number, zoom: number, nw: number, nh: number): { x: number; y: number } {
  const imgW = nw * zoom
  const imgH = nh * zoom
  return {
    x: Math.min(MARGIN, Math.max(MARGIN + FRAME - imgW, panX)),
    y: Math.min(MARGIN, Math.max(MARGIN + FRAME - imgH, panY)),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PhotoCropper = forwardRef<PhotoCropperHandle, PhotoCropperProps>(
  function PhotoCropper({ rawDataUrl, onCropped, shape = 'square' }, ref) {
    const t = useTranslations('registration')
    const imgRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 })
    const [minZoom, setMinZoom] = useState(1)
    const [transform, setTransform] = useState<Transform>({ zoom: 1, panX: MARGIN, panY: MARGIN })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ clientX: 0, clientY: 0, panX: MARGIN, panY: MARGIN })
    const [error, setError] = useState('')

    // Refs for use inside native event handlers (avoids stale closures)
    const transformRef = useRef(transform)
    const minZoomRef = useRef(minZoom)
    const naturalSizeRef = useRef(naturalSize)
    useEffect(() => { transformRef.current = transform }, [transform])
    useEffect(() => { minZoomRef.current = minZoom }, [minZoom])
    useEffect(() => { naturalSizeRef.current = naturalSize }, [naturalSize])

    // Pinch tracking refs
    const lastPinchDist = useRef<number | null>(null)

    // ── Init on new image ──

    useEffect(() => {
      if (!rawDataUrl) return
      setError('')

      const img = new Image()
      img.onload = () => {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        setNaturalSize({ w: nw, h: nh })

        // Scale so the shorter side just fills the crop frame
        const z = Math.max(FRAME / nw, FRAME / nh)
        setMinZoom(z)

        // Centre the image in the viewport
        const imgW = nw * z
        const imgH = nh * z
        const centreX = MARGIN + (FRAME - imgW) / 2
        const centreY = MARGIN + (FRAME - imgH) / 2
        const clamped = clampPan(centreX, centreY, z, nw, nh)
        setTransform({ zoom: z, panX: clamped.x, panY: clamped.y })
      }
      img.src = rawDataUrl
    }, [rawDataUrl])

    // ── Native wheel + touchmove (need passive:false) ──

    useEffect(() => {
      const el = containerRef.current
      if (!el) return

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const { zoom: z1, panX, panY } = transformRef.current
        const { w: nw, h: nh } = naturalSizeRef.current
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        const z2 = Math.min(MAX_ZOOM, Math.max(minZoomRef.current, z1 * factor))
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const newPanX = cx - (cx - panX) * (z2 / z1)
        const newPanY = cy - (cy - panY) * (z2 / z1)
        const clamped = clampPan(newPanX, newPanY, z2, nw, nh)
        setTransform({ zoom: z2, panX: clamped.x, panY: clamped.y })
      }

      const onTouchMove = (e: TouchEvent) => {
        // Prevent page scroll/zoom while interacting with the cropper
        if (e.cancelable) e.preventDefault()
      }

      el.addEventListener('wheel', onWheel, { passive: false })
      el.addEventListener('touchmove', onTouchMove, { passive: false })
      return () => {
        el.removeEventListener('wheel', onWheel)
        el.removeEventListener('touchmove', onTouchMove)
      }
    }, []) // intentionally empty — reads from refs

    // ── Mouse drag ──

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ clientX: e.clientX, clientY: e.clientY, panX: transform.panX, panY: transform.panY })
    }, [transform.panX, transform.panY])

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return
      const dx = e.clientX - dragStart.clientX
      const dy = e.clientY - dragStart.clientY
      setTransform(prev => {
        const c = clampPan(dragStart.panX + dx, dragStart.panY + dy, prev.zoom, naturalSize.w, naturalSize.h)
        return { ...prev, panX: c.x, panY: c.y }
      })
    }, [isDragging, dragStart, naturalSize])

    const stopDrag = useCallback(() => setIsDragging(false), [])

    // ── Touch drag + pinch ──

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        const t0 = e.touches[0]
        if (!t0) return
        setIsDragging(true)
        setDragStart({ clientX: t0.clientX, clientY: t0.clientY, panX: transform.panX, panY: transform.panY })
        lastPinchDist.current = null
      } else if (e.touches.length === 2) {
        const t0 = e.touches[0]
        const t1 = e.touches[1]
        if (!t0 || !t1) return
        setIsDragging(false)
        lastPinchDist.current = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      }
    }, [transform.panX, transform.panY])

    const handleTouchEnd = useCallback(() => {
      setIsDragging(false)
      lastPinchDist.current = null
    }, [])

    // Single-touch pan (React handler; touchmove preventDefault is handled natively above)
    const handleTouchMoveReact = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && isDragging) {
        const t0 = e.touches[0]
        if (!t0) return
        const dx = t0.clientX - dragStart.clientX
        const dy = t0.clientY - dragStart.clientY
        setTransform(prev => {
          const c = clampPan(dragStart.panX + dx, dragStart.panY + dy, prev.zoom, naturalSize.w, naturalSize.h)
          return { ...prev, panX: c.x, panY: c.y }
        })
      } else if (e.touches.length === 2) {
        const t0 = e.touches[0]
        const t1 = e.touches[1]
        if (!t0 || !t1) return
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
        const last = lastPinchDist.current
        const rect = containerRef.current?.getBoundingClientRect()
        if (last && rect) {
          const factor = dist / last
          const mx = (t0.clientX + t1.clientX) / 2 - rect.left
          const my = (t0.clientY + t1.clientY) / 2 - rect.top
          setTransform(prev => {
            const z1 = prev.zoom
            const z2 = Math.min(MAX_ZOOM, Math.max(minZoom, z1 * factor))
            const px = mx - (mx - prev.panX) * (z2 / z1)
            const py = my - (my - prev.panY) * (z2 / z1)
            const c = clampPan(px, py, z2, naturalSize.w, naturalSize.h)
            return { zoom: z2, panX: c.x, panY: c.y }
          })
        }
        lastPinchDist.current = dist
      }
    }, [isDragging, dragStart, naturalSize, minZoom])

    // ── Zoom slider ──

    const applyZoomFromCenter = useCallback((newZoom: number) => {
      const cx = VIEWPORT / 2
      const cy = VIEWPORT / 2
      setTransform(prev => {
        const z1 = prev.zoom
        const z2 = Math.min(MAX_ZOOM, Math.max(minZoom, newZoom))
        const px = cx - (cx - prev.panX) * (z2 / z1)
        const py = cy - (cy - prev.panY) * (z2 / z1)
        const c = clampPan(px, py, z2, naturalSize.w, naturalSize.h)
        return { zoom: z2, panX: c.x, panY: c.y }
      })
    }, [minZoom, naturalSize])

    // ── Crop & export ──

    const handleConfirm = useCallback(() => {
      const img = imgRef.current
      if (!img) return

      const { zoom, panX, panY } = transformRef.current
      const srcX = (MARGIN - panX) / zoom
      const srcY = (MARGIN - panY) / zoom
      const srcSize = FRAME / zoom

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT)

      // Reduce JPEG quality until ≤ 1 MB
      let quality = 0.92
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      // base64-encoded length → binary bytes ≈ (len - prefix) × 0.75
      while ((dataUrl.length - 23) * 0.75 > MAX_BYTES && quality > 0.3) {
        quality -= 0.05
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }

      if ((dataUrl.length - 23) * 0.75 > MAX_BYTES) {
        setError(t('photoCropSizeError'))
        return
      }

      onCropped(dataUrl)
    }, [onCropped, t])

    useImperativeHandle(ref, () => ({ crop: handleConfirm }), [handleConfirm])

    // ── Zoom slider value (0–100) ──

    const zoomRange = MAX_ZOOM - minZoom
    const zoomPct = zoomRange > 0 ? Math.round(((transform.zoom - minZoom) / zoomRange) * 100) : 0

    // ── Render ──

    return (
      <div className="flex w-full flex-col items-center">
        {/* Crop viewport */}
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl bg-neutral-900 select-none touch-none"
          style={{
            width: VIEWPORT,
            height: VIEWPORT,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMoveReact}
          onTouchEnd={handleTouchEnd}
        >
          {/* The image */}
          {rawDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={rawDataUrl}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transformOrigin: '0 0',
                transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})`,
                maxWidth: 'none',
                maxHeight: 'none',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          )}

          {shape === 'circle' ? (
            /* Circular mask — a round hole in the dark overlay (the huge box-shadow
               is clipped to the viewport by overflow-hidden). Matches the avatar. */
            <div
              className="absolute pointer-events-none rounded-full ring-2 ring-white/85"
              style={{
                top: MARGIN,
                left: MARGIN,
                width: FRAME,
                height: FRAME,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              }}
            />
          ) : (
            <>
              {/* Dark overlay — 4 panels around the square crop frame */}
              <div className="absolute pointer-events-none bg-black/60" style={{ inset: 0, bottom: VIEWPORT - MARGIN }} />
              <div className="absolute pointer-events-none bg-black/60" style={{ inset: 0, top: MARGIN + FRAME }} />
              <div className="absolute pointer-events-none bg-black/60" style={{ top: MARGIN, bottom: VIEWPORT - MARGIN - FRAME, left: 0, width: MARGIN }} />
              <div className="absolute pointer-events-none bg-black/60" style={{ top: MARGIN, bottom: VIEWPORT - MARGIN - FRAME, right: 0, left: MARGIN + FRAME }} />

              {/* Rule-of-thirds grid (inside crop frame) */}
              <div className="absolute pointer-events-none" style={{ top: MARGIN, left: MARGIN, width: FRAME, height: FRAME }}>
                <div className="absolute bg-white/15" style={{ top: '33.3%', left: 0, right: 0, height: 1 }} />
                <div className="absolute bg-white/15" style={{ top: '66.6%', left: 0, right: 0, height: 1 }} />
                <div className="absolute bg-white/15" style={{ top: 0, left: '33.3%', bottom: 0, width: 1 }} />
                <div className="absolute bg-white/15" style={{ top: 0, left: '66.6%', bottom: 0, width: 1 }} />
              </div>

              {/* Corner brackets */}
              {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                <div
                  key={corner}
                  className="absolute pointer-events-none border-white"
                  style={{
                    top: corner.startsWith('t') ? MARGIN : MARGIN + FRAME - CORNER,
                    left: corner.endsWith('l') ? MARGIN : MARGIN + FRAME - CORNER,
                    width: CORNER,
                    height: CORNER,
                    borderTopWidth: corner.startsWith('t') ? 2 : 0,
                    borderBottomWidth: corner.startsWith('b') ? 2 : 0,
                    borderLeftWidth: corner.endsWith('l') ? 2 : 0,
                    borderRightWidth: corner.endsWith('r') ? 2 : 0,
                    borderRadius: corner === 'tl' ? '2px 0 0 0' : corner === 'tr' ? '0 2px 0 0' : corner === 'bl' ? '0 0 0 2px' : '0 0 2px 0',
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* Zoom slider — sits directly under the photo box, matched to its width */}
        <div className="flex items-center gap-2 pt-3" style={{ width: VIEWPORT }}>
          <Button
            variant="icon"
            type="button"
            aria-label="Zoom out"
            className="shrink-0 p-1.5"
            onClick={() => applyZoomFromCenter(transform.zoom * 0.9)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <input
            type="range"
            min={0}
            max={100}
            value={zoomPct}
            aria-label={t('photoCropZoom')}
            onChange={(e) => {
              const pct = Number(e.target.value) / 100
              applyZoomFromCenter(minZoom + pct * (MAX_ZOOM - minZoom))
            }}
            className="flex-1 accent-primary"
          />
          <Button
            variant="icon"
            type="button"
            aria-label="Zoom in"
            className="shrink-0 p-1.5"
            onClick={() => applyZoomFromCenter(transform.zoom * 1.1)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
            style={{ width: VIEWPORT }}
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
    )
  },
)
