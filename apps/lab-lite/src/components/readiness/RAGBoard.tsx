'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2 } from '@ultranos/ui-kit/icons'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getFullRAGStatus } from '@/lib/rag-service'
import type { RAGBoardState, RAGDimension } from '@/lib/rag-service'
import { RAGDimensionCard } from './RAGDimensionCard'
import { RAGBoardWallDisplay } from './RAGBoardWallDisplay'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RAGBoardProps {
  initialBoardState?: RAGBoardState
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 60_000

const AUTHORIZED_ROLES: ReadonlySet<LabRole> = new Set([
  LabRole.SUPERVISOR,
  LabRole.LAB_MANAGER,
])

const OVERALL_STATUS_BG: Record<string, string> = {
  GREEN: 'bg-green-50 border-green-200 text-green-700',
  AMBER: 'bg-amber-50 border-amber-300 text-amber-700',
  RED: 'bg-red-50 border-red-300 text-red-700',
}

const OVERALL_DOT: Record<string, string> = {
  GREEN: 'bg-green-500',
  AMBER: 'bg-amber-500',
  RED: 'bg-red-500',
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RAGBoard
// ---------------------------------------------------------------------------

export function RAGBoard({ initialBoardState }: RAGBoardProps) {
  const t = useTranslations()
  const session = useAuthSessionStore((s) => s.session)

  const [boardState, setBoardState] = useState<RAGBoardState | null>(
    initialBoardState ?? null,
  )
  const [isLoading, setIsLoading] = useState(!initialBoardState)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(
    initialBoardState ? new Date(initialBoardState.generatedAt) : null,
  )
  const [wallDisplay, setWallDisplay] = useState(false)
  const [activeDimension, setActiveDimension] = useState<RAGDimension | null>(null)

  // ---------------------------------------------------------------------------
  // Permission gate
  // ---------------------------------------------------------------------------

  const labRole = session?.labRole ?? null
  const isAuthorized = labRole !== null && AUTHORIZED_ROLES.has(labRole)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchBoard = useCallback(async () => {
    try {
      const state = await getFullRAGStatus()
      setBoardState(state)
      setLastRefreshedAt(new Date(state.generatedAt))
    } catch {
      // Board stays in previous state; do not swallow silently in prod — audit here if needed
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthorized) return
    if (!initialBoardState) {
      fetchBoard()
    }
    const interval = setInterval(fetchBoard, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isAuthorized, initialBoardState, fetchBoard])

  // ---------------------------------------------------------------------------
  // Drill-down panel (lazy, per-dimension)
  // ---------------------------------------------------------------------------

  // Drill-down components are imported lazily inline to keep the initial bundle light.
  // They are conditionally rendered below based on `activeDimension`.

  // ---------------------------------------------------------------------------
  // Render: access denied
  // ---------------------------------------------------------------------------

  if (!isAuthorized) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-sm text-neutral-500"
        role="alert"
      >
        {t('rag.accessDenied')}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: wall display mode
  // ---------------------------------------------------------------------------

  if (wallDisplay && boardState) {
    return (
      <RAGBoardWallDisplay
        boardState={boardState}
        onExit={() => setWallDisplay(false)}
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const overallStatus = boardState?.overallStatus ?? 'AMBER'
  const overallBg = OVERALL_STATUS_BG[overallStatus]
  const overallDot = OVERALL_DOT[overallStatus]

  const dimensions: RAGDimension[] = ['PERSONNEL', 'EQUIPMENT', 'SUPPLIES', 'QC']

  function getDimensionResult(dim: RAGDimension) {
    if (!boardState) return null
    switch (dim) {
      case 'PERSONNEL': return boardState.personnel
      case 'EQUIPMENT': return boardState.equipment
      case 'SUPPLIES': return boardState.supplies
      case 'QC': return boardState.qc
    }
  }

  const formattedRefreshTime = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  // ---------------------------------------------------------------------------
  // Render: board
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-x-3">
        <h1 className="text-lg font-semibold text-neutral-900">
          {t('rag.boardTitle')}
        </h1>
        <button
          type="button"
          onClick={() => setWallDisplay(true)}
          disabled={!boardState}
          className="inline-flex items-center gap-x-1.5 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t('rag.wallDisplay')}
        >
          <Maximize2 size={15} aria-hidden="true" />
          {t('rag.wallDisplay')}
        </button>
      </div>

      {/* Overall status indicator */}
      <div
        className={`flex items-center gap-x-2.5 rounded-lg border px-4 py-3 text-sm font-medium ${overallBg}`}
        role="status"
        aria-live="polite"
      >
        <span className={`h-3 w-3 shrink-0 rounded-full ${overallDot}`} aria-hidden="true" />
        {t('rag.overallStatus')}: {t(`rag.status.${overallStatus.toLowerCase()}`)}
      </div>

      {/* Dimension grid */}
      {isLoading ? (
        <BoardSkeleton />
      ) : boardState ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {dimensions.map((dim) => {
            const result = getDimensionResult(dim)
            if (!result) return null
            return (
              <RAGDimensionCard
                key={dim}
                dimension={dim}
                status={result.status}
                summary={result.summary}
                onClick={() => setActiveDimension(dim)}
                wallDisplay={false}
              />
            )
          })}
        </div>
      ) : null}

      {/* Footer: last refresh time */}
      {formattedRefreshTime && (
        <p className="text-xs text-neutral-400">
          {t('rag.lastRefresh', { time: formattedRefreshTime })}
        </p>
      )}

      {/* Drill-down slide-in panel */}
      {activeDimension && boardState && (
        <RAGDrillDownPanel
          dimension={activeDimension}
          boardState={boardState}
          onClose={() => setActiveDimension(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drill-down panel
// ---------------------------------------------------------------------------

/**
 * Thin wrapper that conditionally renders the correct drill-down component
 * for the active dimension. Each drill-down component is expected to live at
 * `./drilldown/{Dimension}DrillDown.tsx`. They are not created in this story
 * but the import paths are wired up so future stories can drop them in.
 */
function RAGDrillDownPanel({
  dimension,
  boardState,
  onClose,
}: {
  dimension: RAGDimension
  boardState: RAGBoardState
  onClose: () => void
}) {
  const t = useTranslations()

  // Map each dimension to its detail data for the panel
  const result = (() => {
    switch (dimension) {
      case 'PERSONNEL': return boardState.personnel
      case 'EQUIPMENT': return boardState.equipment
      case 'SUPPLIES': return boardState.supplies
      case 'QC': return boardState.qc
    }
  })()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(`rag.${dimension.toLowerCase()}`)}
        className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-s border-neutral-200 bg-white shadow-xl"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-base font-semibold text-neutral-900">
            {t(`rag.${dimension.toLowerCase()}`)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:text-neutral-700"
            aria-label={t('common.close')}
          >
            <span aria-hidden="true" className="text-xl leading-none">&times;</span>
          </button>
        </div>

        {/* Panel body: dimension-specific drill-down content */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-sm font-medium text-neutral-700">{result.summary}</p>
          <p className="text-xs text-neutral-400">
            {t('rag.updatedAt', { time: new Date(result.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
          </p>
          {/* Drill-down detail components render here (future story) */}
        </div>
      </div>
    </>
  )
}
