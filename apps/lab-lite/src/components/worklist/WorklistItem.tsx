'use client'

import { useRef } from 'react'
import type { PrioritizedSample } from '@/lib/prioritization-engine'
import type { SampleLock } from '@/lib/db'
import { UrgencyBadge } from './UrgencyBadge'
import { StabilityBadge } from './StabilityBadge'
import { BatchGroupIndicator } from './BatchGroupIndicator'
import { LockIndicator } from '@/components/samples/LockIndicator'

interface WorklistItemProps {
  sample: PrioritizedSample
  rank: number
  /** Whether this item shares a batch group with the previous item. */
  isInBatch: boolean
  isBatchStart: boolean
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
  isInBatch,
  isBatchStart,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onTouchStart,
  index,
  onResetOverride,
  activeLock,
  currentTechId,
}: WorklistItemProps) {
  const isLockedByOther = activeLock?.status === 'ACTIVE' && activeLock.techId !== currentTechId
  const rowRef = useRef<HTMLDivElement>(null)

  const timeInQueueLabel =
    sample.timeInQueueMinutes < 60
      ? `${sample.timeInQueueMinutes}m`
      : `${Math.floor(sample.timeInQueueMinutes / 60)}h ${sample.timeInQueueMinutes % 60}m`

  return (
    <div
      ref={rowRef}
      className={`relative flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm transition-opacity select-none
        ${isDragging ? 'opacity-50 border-dashed border-blue-400' : 'border-border hover:border-border'}
        ${sample.stabilityStatus === 'expired' ? 'border-red-300 bg-red-50' : ''}
        ${isLockedByOther ? 'opacity-60' : ''}
      `}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index) }}
      onDrop={(e) => { e.preventDefault(); onDrop(index) }}
      onTouchStart={(e) => onTouchStart(e, index)}
      aria-label={`Sample ${rank}: ${sample.loincDisplay} for ${sample.patientRef.firstName}`}
      role="listitem"
    >
      {/* Batch group left-border indicator */}
      <BatchGroupIndicator isInBatch={isInBatch} isBatchStart={isBatchStart} />

      {/* Rank number */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {rank}
      </div>

      {/* Urgency badge */}
      <UrgencyBadge urgency={sample.urgency} />

      {/* Patient + test info — grows to fill space */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {sample.patientRef.firstName}
          <span className="ms-1 text-xs font-normal text-muted-foreground">
            {sample.patientRef.age}y
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{sample.loincDisplay}</p>
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

      {/* Manual override chip */}
      {sample.isManualOverride && (
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            Manual
          </span>
          <button
            type="button"
            onClick={() => onResetOverride(sample.sampleId)}
            className="text-xs text-blue-600 underline hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label={`Reset manual override for ${sample.patientRef.firstName}`}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
