'use client'
import * as React from 'react'
import { Dialog, DialogContent, DialogTitle } from './dialog.js'
import { ZoomIn, ZoomOut, Maximize2, X } from '../../icons.js'

const MIN = 1
const MAX = 8
const STEP = 0.5

export interface ImageViewerProps {
  src: string
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageViewer({ src, alt, open, onOpenChange }: ImageViewerProps) {
  const [scale, setScale] = React.useState(1)
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const drag = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    if (!open) { setScale(1); setOffset({ x: 0, y: 0 }) }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s))
  const zoomIn = () => setScale((s) => clamp(s + STEP))
  const zoomOut = () => setScale((s) => clamp(s - STEP))
  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden bg-card p-0">
        <DialogTitle className="sr-only">Image viewer</DialogTitle>
        <div className="flex items-center justify-end gap-2 border-b border-border p-2">
          <button type="button" aria-label="Zoom out" onClick={zoomOut} className="rounded-lg p-2 text-foreground hover:bg-muted"><ZoomOut size={18} /></button>
          <button type="button" aria-label="Zoom in" onClick={zoomIn} className="rounded-lg p-2 text-foreground hover:bg-muted"><ZoomIn size={18} /></button>
          <button type="button" aria-label="Reset zoom" onClick={reset} className="rounded-lg p-2 text-foreground hover:bg-muted"><Maximize2 size={18} /></button>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="rounded-lg p-2 text-foreground hover:bg-muted"><X size={18} /></button>
        </div>
        <div
          className="flex h-[70vh] items-center justify-center overflow-hidden bg-black/5"
          onWheel={(e) => { e.deltaY < 0 ? zoomIn() : zoomOut() }}
          onPointerDown={(e) => { if (scale > 1) drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y } }}
          onPointerMove={(e) => { if (drag.current) setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }) }}
          onPointerUp={() => { drag.current = null }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full select-none"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
