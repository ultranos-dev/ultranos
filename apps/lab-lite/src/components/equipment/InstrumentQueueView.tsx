'use client'

/**
 * Story 51.4 — Instrument Queue View
 * Tasks 6, 7, 8: Displays queue for selected instrument; supports Start/Complete/Cancel
 * run actions; manager queue override (reorder, remove, insert urgent); next-in-line
 * notification panel.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  getInstruments,
  getInstrumentQueue,
  startBatch,
  completeBatch,
  cancelBatch,
  reorderQueue,
  getActiveInstrumentNotifications,
  dismissInstrumentNotification,
} from '@/lib/equipment-service'
import type { Instrument, InstrumentNotification } from '@/lib/db'
import type { QueuedBatchWithTimes } from '@/lib/equipment-service'
import { BatchCard } from './BatchCard'
import { QueueBatchDialog } from './QueueBatchDialog'
import { Button } from '@/components/ui/Button'

export function InstrumentQueueView() {
  const t = useTranslations('equipment')
  const session = useAuthSessionStore((s) => s.session)
  const isManager = session?.labRole === LabRole.LAB_MANAGER
  const techId = session?.practitionerId ?? ''
  const techName = session?.email?.split('@')[0] ?? 'Technician'

  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('')
  const [queue, setQueue] = useState<QueuedBatchWithTimes[]>([])
  const [loading, setLoading] = useState(false)
  const [showQueueDialog, setShowQueueDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<InstrumentNotification[]>([])

  // Countdown timer for current running batch
  const [now, setNow] = useState(() => new Date())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load instruments on mount
  useEffect(() => {
    void getInstruments().then((all) => {
      setInstruments(all)
      if (all.length > 0 && !selectedInstrumentId) {
        setSelectedInstrumentId(all[0].id)
      }
    })
  }, [selectedInstrumentId])

  // Reload queue when instrument selection changes
  const reloadQueue = useCallback(async () => {
    if (!selectedInstrumentId) return
    setLoading(true)
    setError(null)
    try {
      const q = await getInstrumentQueue(selectedInstrumentId)
      setQueue(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [selectedInstrumentId])

  useEffect(() => {
    void reloadQueue()
    // Poll every 30s for live updates
    const interval = setInterval(() => void reloadQueue(), 30_000)
    return () => clearInterval(interval)
  }, [reloadQueue])

  // Real-time countdown: tick every second when there's a RUNNING batch
  useEffect(() => {
    const hasRunning = queue.some((b) => b.status === 'RUNNING')
    if (hasRunning) {
      timerRef.current = setInterval(() => setNow(new Date()), 1_000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [queue])

  // Load pending next-in-line notifications for this tech
  useEffect(() => {
    if (!techId) return
    void getActiveInstrumentNotifications(techId).then(setNotifications)
  }, [techId, queue])

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  async function handleStartRun(batchId: string) {
    setError(null)
    try {
      await startBatch(batchId)
      await reloadQueue()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start run')
    }
  }

  async function handleCompleteRun(batchId: string) {
    setError(null)
    try {
      await completeBatch(batchId)
      await reloadQueue()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete run')
    }
  }

  async function handleCancel(batchId: string) {
    const reason = window.prompt(t('cancelReasonPrompt') ?? 'Reason for cancelling:')
    if (reason === null) return
    setError(null)
    try {
      await cancelBatch(batchId, reason)
      await reloadQueue()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel batch')
    }
  }

  // Manager: move a batch up one position
  async function handleMoveUp(batchId: string) {
    const idx = queue.findIndex((b) => b.id === batchId)
    if (idx <= 0) return
    const newOrder = [...queue]
    ;[newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]]
    await applyReorder(newOrder.map((b) => b.id))
  }

  // Manager: move a batch down one position
  async function handleMoveDown(batchId: string) {
    const idx = queue.findIndex((b) => b.id === batchId)
    if (idx < 0 || idx >= queue.length - 1) return
    const newOrder = [...queue]
    ;[newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]]
    await applyReorder(newOrder.map((b) => b.id))
  }

  async function applyReorder(orderedIds: string[]) {
    if (!selectedInstrumentId || !techId) return
    setError(null)
    try {
      await reorderQueue(selectedInstrumentId, orderedIds, techId)
      await reloadQueue()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reorder queue')
    }
  }

  // -------------------------------------------------------------------------
  // Current batch countdown
  // -------------------------------------------------------------------------

  const currentBatch = queue.find((b) => b.position === 1 && b.status === 'RUNNING')
  const countdownText = (() => {
    if (!currentBatch?.estimatedCompletionTime) return null
    const ms = currentBatch.estimatedCompletionTime.getTime() - now.getTime()
    if (ms <= 0) return t('overdue') ?? 'Overdue'
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${String(sec).padStart(2, '0')}`
  })()

  const selectedInstrument = instruments.find((i) => i.id === selectedInstrumentId)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4" data-testid="instrument-queue-view">
      {/* Instrument selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {t('instruments')}
          </label>
          <select
            className="form-input w-full max-w-xs"
            value={selectedInstrumentId}
            onChange={(e) => setSelectedInstrumentId(e.target.value)}
            data-testid="instrument-selector"
          >
            {instruments.length === 0 && (
              <option value="">{t('noInstruments') ?? 'No instruments'}</option>
            )}
            {instruments.map((i) => (
              <option key={i.id} value={i.id} disabled={i.status === 'OUT_OF_SERVICE'}>
                {i.name} {i.status === 'OUT_OF_SERVICE' ? `(${t('outOfService')})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedInstrument?.status === 'IN_SERVICE' && (
          <Button
            onClick={() => setShowQueueDialog(true)}
            className="mt-4"
            data-testid="queue-my-batch-btn"
          >
            {t('queueBatch')}
          </Button>
        )}
      </div>

      {/* Status pill for selected instrument */}
      {selectedInstrument && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">{selectedInstrument.name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              selectedInstrument.status === 'IN_SERVICE'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {selectedInstrument.status === 'IN_SERVICE' ? t('inService') : t('outOfService')}
          </span>
          <span className="text-gray-400 text-xs">
            {t('avgRunTime')}: {selectedInstrument.avgRunTimeMinutes} min
          </span>
        </div>
      )}

      {/* Next-in-line notifications for this tech */}
      {notifications.length > 0 && (
        <div className="space-y-2" data-testid="instrument-notifications">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className="flex items-start justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              data-testid={`notif-${notif.id}`}
            >
              <span className="text-amber-800">
                🔔{' '}
                {t('nextInLine', { instrument: notif.instrumentName })}
              </span>
              <button
                onClick={() => {
                  void dismissInstrumentNotification(notif.id).then(() => {
                    setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
                  })
                }}
                className="ms-2 shrink-0 text-amber-600 hover:text-amber-800"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* Queue list */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">
          <svg
            className="animate-spin mx-auto h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : queue.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500" data-testid="empty-queue-message">
          {t('emptyQueue') ?? 'No batches in queue.'}
        </p>
      ) : (
        <div className="space-y-2" data-testid="queue-list">
          {/* Countdown banner for current running batch */}
          {currentBatch && countdownText && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center" data-testid="countdown-banner">
              <p className="text-xs text-amber-600 font-medium">{t('currentBatch')} · {currentBatch.techName}</p>
              <p className="text-2xl font-bold tabular-nums text-amber-700 mt-0.5">{countdownText}</p>
              <div
                className="mt-1 h-1.5 w-full rounded-full bg-amber-200 overflow-hidden"
                role="progressbar"
                aria-label={t('progress') ?? 'Progress'}
              >
                {(() => {
                  if (!currentBatch.startedAt || !currentBatch.estimatedCompletionTime) return null
                  const total = currentBatch.estimatedCompletionTime.getTime() - new Date(currentBatch.startedAt).getTime()
                  const elapsed = now.getTime() - new Date(currentBatch.startedAt).getTime()
                  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100))
                  return <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
                })()}
              </div>
            </div>
          )}

          {queue.map((batch, idx) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              isCurrentTech={batch.techId === techId}
              isManager={isManager}
              isCurrent={batch.position === 1}
              showManagerControls={isManager}
              isFirst={idx === 0}
              isLast={idx === queue.length - 1}
              onStartRun={handleStartRun}
              onCompleteRun={handleCompleteRun}
              onCancel={handleCancel}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </div>
      )}

      {/* Queue Batch Dialog */}
      {showQueueDialog && (
        <QueueBatchDialog
          preselectedInstrumentId={selectedInstrumentId}
          techId={techId}
          techName={techName}
          onSuccess={async () => {
            setShowQueueDialog(false)
            await reloadQueue()
          }}
          onClose={() => setShowQueueDialog(false)}
        />
      )}
    </div>
  )
}
