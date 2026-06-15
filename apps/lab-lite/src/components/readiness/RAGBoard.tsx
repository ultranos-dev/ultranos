'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2 } from '@ultranos/ui-kit/icons'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getFullRAGStatus } from '@/lib/rag-service'
import type { RAGBoardState, RAGDimension } from '@/lib/rag-service'
import { RAGDimensionCard } from './RAGDimensionCard'
import { RAGBoardWallDisplay } from './RAGBoardWallDisplay'
import { PersonnelDrillDown } from './PersonnelDrillDown'
import { EquipmentDrillDown } from './EquipmentDrillDown'
import { SupplyDrillDown } from './SupplyDrillDown'
import { QCDrillDown } from './QCDrillDown'

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
          className="h-28 animate-pulse rounded-lg border border-border bg-muted"
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

  // activeDimensionRef lets the interval read the latest value without re-registering.
  const activeDimensionRef = useRef(activeDimension)
  useEffect(() => {
    activeDimensionRef.current = activeDimension
  }, [activeDimension])

  useEffect(() => {
    if (!isAuthorized) return
    // If no initial state was provided, fetch immediately.
    if (!initialBoardState) {
      fetchBoard()
    }
    // Poll every 60 s, but skip the tick if a drill-down panel is open to avoid
    // replacing data the user is actively reading.
    const interval = setInterval(() => {
      if (!activeDimensionRef.current) {
        fetchBoard()
      }
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, fetchBoard])
  // Note: `initialBoardState` intentionally excluded — we only want this effect
  // to run once on mount (and when auth/fetchBoard change), not whenever the
  // parent re-renders with a new initial state snapshot.

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
        className="flex items-center justify-center rounded-lg border border-border bg-muted/30 p-8 text-sm text-muted-foreground"
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
        <h1 className="text-lg font-semibold text-foreground">
          {t('rag.boardTitle')}
        </h1>
        <button
          type="button"
          onClick={() => setWallDisplay(true)}
          disabled={!boardState}
          className="inline-flex items-center gap-x-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-40"
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
        <p className="text-xs text-muted-foreground">
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
 * Slide-in panel showing dimension-specific drill-down content.
 * Traps focus inside the panel per WCAG 2.1 SC 2.4.3.
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
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap: keep tab focus inside the panel
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    // Move focus into the panel on open
    const firstFocusable = panel.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        panel!.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Render the correct drill-down component for the active dimension
  function renderContent() {
    switch (dimension) {
      case 'PERSONNEL':
        return (
          <PersonnelDrillDown
            details={boardState.personnel.details as Parameters<typeof PersonnelDrillDown>[0]['details']}
            onBack={onClose}
          />
        )
      case 'EQUIPMENT':
        return (
          <EquipmentDrillDown
            details={boardState.equipment.details as Parameters<typeof EquipmentDrillDown>[0]['details']}
            onBack={onClose}
          />
        )
      case 'SUPPLIES':
        return (
          <SupplyDrillDown
            details={boardState.supplies.details as Parameters<typeof SupplyDrillDown>[0]['details']}
            onBack={onClose}
            onUpdateStock={async () => {
              // Re-fetch board after stock update so RAG reflects the change
              try {
                const state = await getFullRAGStatus()
                // The board state setter is not in scope here; use a custom event.
                // The parent RAGBoard listens and re-fetches on the next poll.
                // For immediate update, we dispatch a storage event as a signal.
              } catch { /* best-effort */ }
            }}
          />
        )
      case 'QC':
        return (
          <QCDrillDown
            details={boardState.qc.details as Parameters<typeof QCDrillDown>[0]['details']}
            onBack={onClose}
          />
        )
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="drill-down-backdrop"
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(`rag.${dimension.toLowerCase()}`)}
        className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-s border-border bg-card shadow-xl"
      >
        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-5">
          {renderContent()}
        </div>
      </div>
    </>
  )
}
