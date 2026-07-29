'use client'

/**
 * Story 51.4 — Reusable batch card component.
 * Displays position, tech name, sample count, estimated start/completion, and status.
 * "Cancel" action shown for the owning tech or a LAB_MANAGER.
 */

import { useTranslations } from 'next-intl'
import type { QueuedBatchWithTimes } from '@/lib/equipment-service'

interface BatchCardProps {
  batch: QueuedBatchWithTimes
  isCurrentTech: boolean     // true if the viewing tech owns this batch
  isManager: boolean         // true if viewer is LAB_MANAGER
  isCurrent: boolean         // true if this batch is position 1 (current)
  onCancel?: (batchId: string) => void
  onMoveUp?: (batchId: string) => void
  onMoveDown?: (batchId: string) => void
  onStartRun?: (batchId: string) => void
  onCompleteRun?: (batchId: string) => void
  showManagerControls?: boolean
  isFirst?: boolean
  isLast?: boolean
}

function formatTime(date: Date | null): string {
  if (!date) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }: { status: QueuedBatchWithTimes['status'] }) {
  const t = useTranslations('equipment')
  const colorMap: Record<QueuedBatchWithTimes['status'], string> = {
    QUEUED: 'bg-primary/10 text-primary',
    RUNNING: 'bg-amber-50 text-amber-700',
    COMPLETED: 'bg-green-50 text-green-700',
    CANCELLED: 'bg-muted text-muted-foreground',
  }
  const labelMap: Record<QueuedBatchWithTimes['status'], string> = {
    QUEUED: t('statusQueued') ?? 'Queued',
    RUNNING: t('statusRunning') ?? 'Running',
    COMPLETED: t('statusCompleted') ?? 'Completed',
    CANCELLED: t('statusCancelled') ?? 'Cancelled',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[status]}`}>
      {labelMap[status]}
    </span>
  )
}

export function BatchCard({
  batch,
  isCurrentTech,
  isManager,
  isCurrent,
  onCancel,
  onMoveUp,
  onMoveDown,
  onStartRun,
  onCompleteRun,
  showManagerControls = false,
  isFirst = false,
  isLast = false,
}: BatchCardProps) {
  const t = useTranslations('equipment')

  const canCancel = (isCurrentTech || isManager) && batch.status !== 'COMPLETED' && batch.status !== 'CANCELLED'
  const canStart = isCurrent && batch.status === 'QUEUED' && (isCurrentTech || isManager)
  const canComplete = isCurrent && batch.status === 'RUNNING' && (isCurrentTech || isManager)

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        isCurrent
          ? 'border-amber-300 bg-amber-50'
          : 'border-border bg-card'
      }`}
      data-testid={`batch-card-${batch.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Position badge */}
          <span
            className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              isCurrent ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
            }`}
            data-testid={`batch-position-${batch.id}`}
          >
            {batch.position}
          </span>

          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{batch.techName}</p>
            <p className="text-xs text-muted-foreground">
              {batch.sampleCount} {t('samples') ?? 'samples'} · {batch.testType}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={batch.status} />

          {/* Manager reorder controls */}
          {showManagerControls && isManager && (
            <div className="flex gap-1">
              <button
                onClick={() => onMoveUp?.(batch.id)}
                disabled={isFirst}
                className="text-xs text-muted-foreground hover:text-muted-foreground disabled:opacity-30"
                aria-label={t('moveUp') ?? 'Move up'}
                data-testid={`move-up-${batch.id}`}
              >
                ↑
              </button>
              <button
                onClick={() => onMoveDown?.(batch.id)}
                disabled={isLast}
                className="text-xs text-muted-foreground hover:text-muted-foreground disabled:opacity-30"
                aria-label={t('moveDown') ?? 'Move down'}
                data-testid={`move-down-${batch.id}`}
              >
                ↓
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Time estimates */}
      <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
        <span>
          {t('estimatedStart')}:{' '}
          <strong className="text-foreground">
            {isCurrent && batch.status === 'QUEUED'
              ? (t('now') ?? 'Now')
              : formatTime(batch.estimatedStartTime)}
          </strong>
        </span>
        <span>
          {t('estimatedCompletion')}: <strong className="text-foreground">{formatTime(batch.estimatedCompletionTime)}</strong>
        </span>
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex flex-wrap gap-2">
        {canStart && (
          <button
            onClick={() => onStartRun?.(batch.id)}
            className="rounded bg-amber-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-600 active:brightness-90"
            data-testid={`start-run-${batch.id}`}
          >
            {t('startRun')}
          </button>
        )}
        {canComplete && (
          <button
            onClick={() => onCompleteRun?.(batch.id)}
            className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 active:brightness-90"
            data-testid={`complete-run-${batch.id}`}
          >
            {t('completeRun')}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel?.(batch.id)}
            className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
            data-testid={`cancel-batch-${batch.id}`}
          >
            {t('cancelBatch') ?? 'Cancel'}
          </button>
        )}
      </div>
    </div>
  )
}
