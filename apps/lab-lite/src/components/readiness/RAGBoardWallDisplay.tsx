'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { RAGBoardState, RAGDimension } from '@/lib/rag-service'
import { RAGDimensionCard } from './RAGDimensionCard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RAGBoardWallDisplayProps {
  boardState: RAGBoardState
  onExit: () => void
  /** Optional lab name shown in the top-left corner. */
  labName?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURSOR_HIDE_DELAY_MS = 5_000

// ---------------------------------------------------------------------------
// RAGBoardWallDisplay
// ---------------------------------------------------------------------------

export function RAGBoardWallDisplay({ boardState, onExit, labName }: RAGBoardWallDisplayProps) {
  const t = useTranslations()
  const [clock, setClock] = useState(() => new Date())
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live clock — updates every second
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  // ESC key → exit wall display
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onExit()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onExit])

  // Cursor auto-hide after 5 s of inactivity.
  // We use a mounted ref to guard against post-unmount style mutations.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const resetCursorTimer = useCallback(() => {
    document.body.style.cursor = 'default'
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    cursorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        document.body.style.cursor = 'none'
      }
    }, CURSOR_HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    resetCursorTimer()
    document.addEventListener('mousemove', resetCursorTimer)
    document.addEventListener('mousedown', resetCursorTimer)
    return () => {
      document.removeEventListener('mousemove', resetCursorTimer)
      document.removeEventListener('mousedown', resetCursorTimer)
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
      // Always restore cursor when leaving wall display
      document.body.style.cursor = 'default'
    }
  }, [resetCursorTimer])

  const dimensions: RAGDimension[] = ['PERSONNEL', 'EQUIPMENT', 'SUPPLIES', 'QC']

  function getDimensionResult(dim: RAGDimension) {
    switch (dim) {
      case 'PERSONNEL': return boardState.personnel
      case 'EQUIPMENT': return boardState.equipment
      case 'SUPPLIES': return boardState.supplies
      case 'QC': return boardState.qc
    }
  }

  const clockStr = clock.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const generatedTime = new Date(boardState.generatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-card"
      role="region"
      aria-label={t('rag.boardTitle')}
    >
      {/* Top bar: lab name (start) + live clock (end) */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <h1 className="text-lg font-bold text-white">
          {labName ?? t('rag.boardTitle')}
        </h1>
        <time
          dateTime={clock.toISOString()}
          className="text-2xl font-mono font-semibold text-white/90 tabular-nums"
          aria-live="off"
        >
          {clockStr}
        </time>
      </div>

      {/* 2×2 dimension grid */}
      <div className="flex flex-1 items-stretch gap-4 p-6">
        <div className="grid flex-1 grid-cols-2 gap-4">
          {dimensions.map((dim) => {
            const result = getDimensionResult(dim)
            return (
              <RAGDimensionCard
                key={dim}
                dimension={dim}
                status={result.status}
                summary={result.summary}
                // Wall display is read-only — no drill-down interaction.
                // onClick is omitted; the card renders as a non-interactive div.
                wallDisplay
              />
            )
          })}
        </div>
      </div>

      {/* Footer: last refresh timestamp + ESC hint */}
      <div className="flex items-center justify-between px-8 py-3 border-t border-white/10 text-xs text-muted-foreground">
        <span>{t('rag.lastRefresh', { time: generatedTime })}</span>
        <span className="text-muted-foreground">{t('rag.pressEscToExit')}</span>
      </div>
    </div>
  )
}
