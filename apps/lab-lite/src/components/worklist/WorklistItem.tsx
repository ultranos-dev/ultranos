'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { PrioritizedSample } from '@/lib/prioritization-engine'
import type { SampleLock, LabOrderEntry } from '@/lib/db'
import { getSampleById, getDb } from '@/lib/db'
import { UrgencyBadge } from './UrgencyBadge'
import { StabilityBadge } from './StabilityBadge'
import { PatientNameAge } from './PatientNameAge'
import { SampleDetailsModal } from './SampleDetailsModal'
import { LockIndicator } from '@/components/samples/LockIndicator'
import { ReceiveSampleModal } from '@/components/samples/ReceiveSampleModal'
import { RefreshCw, Archive, ArchiveRestore } from '@ultranos/ui-kit/icons'

/**
 * Format a queue duration as "Nd Nh Nm", dropping leading zero units.
 * A long-standing sample reads e.g. "4d 4h 20m" instead of "100h 20m".
 */
function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes))
  const days = Math.floor(m / 1440)
  const hours = Math.floor((m % 1440) / 60)
  const mins = m % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (mins || parts.length === 0) parts.push(`${mins}m`)
  return parts.join(' ')
}

interface WorklistItemProps {
  sample: PrioritizedSample
  rank: number
  isDragging: boolean
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
  onTouchStart: (e: React.TouchEvent, index: number) => void
  index: number
  onResetOverride: (sampleId: string) => Promise<void>
  /** AC 6: active lock for this sample, if any */
  activeLock?: SampleLock | null
  /** ID of the current technician — used to dim action buttons on locked samples */
  currentTechId?: string
  /**
   * Called after a successful re-collection so the parent can refresh the worklist.
   * The parent already triggers a re-fetch on its own refresh cycle; this is an
   * explicit early-refresh hook.
   */
  onRecollected?: () => void
  /** True when rendering inside the Archived shelf — swaps Archive→Unarchive and hides workflow actions. */
  isArchivedView?: boolean
  /** Archive (true) or unarchive (false) this sample. */
  onArchiveToggle?: (sampleId: string, archived: boolean) => void | Promise<void>
}

/**
 * Single worklist row.
 *
 * Displays: rank, urgency badge, patient name+age, test type,
 * stability countdown, time-in-queue, and manual override indicator.
 *
 * RTL-compatible: all spacing uses logical CSS properties.
 * No PHI beyond first name + age (CLAUDE.md Rule #7).
 */
export function WorklistItem({
  sample,
  rank,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onTouchStart,
  index,
  onResetOverride,
  activeLock,
  currentTechId,
  onRecollected,
  isArchivedView = false,
  onArchiveToggle,
}: WorklistItemProps) {
  const router = useRouter()
  const t = useTranslations('worklist')
  const isLockedByOther = activeLock?.status === 'ACTIVE' && activeLock.techId !== currentTechId
  const isExpired = sample.stabilityStatus === 'expired'
  // Enter Result is blocked for expired samples (unstable — must re-collect) and
  // for anything on the Archived shelf, and while another tech holds the lock.
  const enterDisabled = isLockedByOther || isExpired || isArchivedView
  const rowRef = useRef<HTMLDivElement>(null)

  // Detail modal — opens on card click regardless of sample status.
  const [showDetails, setShowDetails] = useState(false)

  // Re-collect modal state — resolved lazily on click to avoid stale closures
  const [recollectProps, setRecollectProps] = useState<{
    orderId: string
    patientRef: string
    patientFirstName: string
    patientAge: number | null
    orders: LabOrderEntry[]
  } | null>(null)

  async function handleRecollect(e: React.MouseEvent) {
    e.stopPropagation()
    const specimen = await getSampleById(sample.sampleId)
    if (!specimen) return
    const opaquePatientRef = specimen.subject?.reference ?? ''
    const orderId = specimen.request?.[0]?.reference?.split('/')?.[1] ?? sample.orderId
    const db = getDb()
    const orderRow = orderId ? await db.orders.get(orderId) : undefined
    setRecollectProps({
      orderId,
      patientRef: opaquePatientRef,
      patientFirstName: sample.patientRef.firstName,
      patientAge: sample.patientRef.age,
      orders: orderRow ? [orderRow] : [],
    })
  }

  const timeInQueueLabel = formatDuration(sample.timeInQueueMinutes)
  const ageLabel =
    sample.patientRef.age > 0 ? t('ageYears', { age: sample.patientRef.age }) : undefined

  return (
    <>
    <div
      ref={rowRef}
      className={`relative flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm transition-colors select-none hover:border-primary/50 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${isDragging ? 'opacity-50 border-dashed border-primary' : 'border-border'}
        ${isExpired ? 'border-red-300 bg-red-50' : ''}
        ${isLockedByOther ? 'opacity-60' : ''}
      `}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index) }}
      onDrop={(e) => { e.preventDefault(); onDrop(index) }}
      onTouchStart={(e) => onTouchStart(e, index)}
      onClick={() => setShowDetails(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setShowDetails(true)
        }
      }}
      tabIndex={0}
      aria-label={t('viewSampleDetails', { name: sample.patientRef.firstName || '—' })}
      role="listitem"
    >
      {/* Rank number */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {rank}
      </div>

      {/* Urgency badge */}
      <UrgencyBadge urgency={sample.urgency} />

      {/* Patient + test info — grows to fill space */}
      <div className="min-w-0 flex-1">
        <PatientNameAge
          firstName={sample.patientRef.firstName}
          ageLabel={ageLabel}
          className="text-sm font-medium text-foreground"
        />
        <p className="truncate text-xs text-muted-foreground">
          {sample.loincDisplay || sample.loincCode || t('unknownTest')}
        </p>
      </div>

      {/* Stability badge */}
      <StabilityBadge
        status={sample.stabilityStatus}
        remainingMinutes={sample.remainingMinutes}
      />

      {/* Time in queue */}
      <span className="shrink-0 text-xs text-muted-foreground" aria-label={`In queue: ${timeInQueueLabel}`}>
        {timeInQueueLabel}
      </span>

      {/* AC 6: Lock indicator — shown when another tech holds the lock */}
      {activeLock && <LockIndicator lock={activeLock} />}

      {/* Manual override chip — active shelf only */}
      {!isArchivedView && sample.isManualOverride && (
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Manual
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void onResetOverride(sample.sampleId) }}
            className="text-xs text-primary underline hover:text-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`Reset manual override for ${sample.patientRef.firstName}`}
          >
            Reset
          </button>
        </div>
      )}

      {/* Archive / Unarchive — secondary action, always available on both shelves */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          void onArchiveToggle?.(sample.sampleId, !isArchivedView)
        }}
        disabled={isLockedByOther}
        className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        aria-label={`${isArchivedView ? t('unarchive') : t('archive')} — ${sample.patientRef.firstName}`}
        title={isArchivedView ? t('unarchive') : t('archive')}
      >
        {isArchivedView ? (
          <ArchiveRestore size={12} aria-hidden="true" className="inline-block me-1" />
        ) : (
          <Archive size={12} aria-hidden="true" className="inline-block me-1" />
        )}
        {isArchivedView ? t('unarchive') : t('archive')}
      </button>

      {/* Re-collect sample — secondary action, opens ReceiveSampleModal for replacement */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleRecollect}
        disabled={isLockedByOther}
        className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        aria-label={`${t('recollect')} — ${sample.patientRef.firstName}`}
        title={t('recollect')}
      >
        <RefreshCw size={12} aria-hidden="true" className="inline-block me-1" />
        {t('recollect')}
      </button>

      {/* Enter results — always shown; disabled for expired / archived / locked samples. */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); router.push(`/results/${sample.sampleId}/enter`) }}
        disabled={enterDisabled}
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        aria-label={`${t('enterResult')} — ${sample.patientRef.firstName}`}
        title={
          isExpired ? t('enterResultExpired') : isArchivedView ? t('enterResultArchived') : t('enterResult')
        }
      >
        {t('enterResult')}
      </button>
    </div>

    {showDetails && (
      <SampleDetailsModal sample={sample} onClose={() => setShowDetails(false)} />
    )}

    {recollectProps && (
      <ReceiveSampleModal
        orderId={recollectProps.orderId}
        patientRef={recollectProps.patientRef}
        patientFirstName={recollectProps.patientFirstName}
        patientAge={recollectProps.patientAge}
        orders={recollectProps.orders}
        onClose={() => setRecollectProps(null)}
        onSuccess={() => {
          setRecollectProps(null)
          onRecollected?.()
        }}
        onViewWorklist={() => {
          setRecollectProps(null)
          onRecollected?.()
          router.push('/worklist')
        }}
      />
    )}
    </>
  )
}
