'use client'

/**
 * Story 51.4 — Queue Batch Dialog
 * Task 6: Form to queue a new batch for an instrument.
 * Validates instrument is in service; shows estimated wait time.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  getInstruments,
  getInstrumentQueue,
  queueBatch,
  type QueueBatchInput,
} from '@/lib/equipment-service'
import type { Instrument, QueuedBatch } from '@/lib/db'
import { Button } from '@/components/ui/Button'

interface QueueBatchDialogProps {
  /** Pre-select an instrument if opened from its queue view */
  preselectedInstrumentId?: string
  /** Override the starting position (for manager insert-at-position) */
  insertAtPosition?: number
  techId: string
  techName: string
  onSuccess: (batch: QueuedBatch) => void
  onClose: () => void
}

function formatWait(minutes: number): string {
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `~${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

export function QueueBatchDialog({
  preselectedInstrumentId,
  techId,
  techName,
  onSuccess,
  onClose,
}: QueueBatchDialogProps) {
  const t = useTranslations('equipment')

  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [selectedInstrumentId, setSelectedInstrumentId] = useState(
    preselectedInstrumentId ?? '',
  )
  const [sampleCount, setSampleCount] = useState(1)
  const [testType, setTestType] = useState('')
  const [runTimeOverride, setRunTimeOverride] = useState<string>('')
  const [estimatedWaitMinutes, setEstimatedWaitMinutes] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getInstruments().then((all) => {
      setInstruments(all.filter((i) => i.status === 'IN_SERVICE'))
    })
  }, [])

  // Recompute estimated wait when instrument changes
  useEffect(() => {
    if (!selectedInstrumentId) {
      setEstimatedWaitMinutes(null)
      return
    }
    void (async () => {
      const queue = await getInstrumentQueue(selectedInstrumentId)
      // P18: for RUNNING batch, subtract elapsed time so the estimate reflects remaining wait,
      // not the full run time of a batch that's already partially complete.
      const totalWait = queue.reduce((sum, b) => {
        if (b.status === 'RUNNING' && b.estimatedCompletionTime) {
          const remainingMs = b.estimatedCompletionTime.getTime() - Date.now()
          return sum + Math.max(0, Math.round(remainingMs / 60_000))
        }
        return sum + b.estimatedRunMinutes
      }, 0)
      setEstimatedWaitMinutes(totalWait)
    })()
  }, [selectedInstrumentId])

  async function handleSubmit() {
    if (!selectedInstrumentId) {
      setError(t('errorSelectInstrument') ?? 'Please select an instrument')
      return
    }
    if (!testType.trim()) {
      setError(t('errorTestType') ?? 'Please enter a test type')
      return
    }
    if (sampleCount < 1) {
      setError(t('errorSampleCount') ?? 'Sample count must be at least 1')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // P6: guard against NaN from non-numeric override input
      const parsedOverride = runTimeOverride ? parseInt(runTimeOverride, 10) : undefined
      if (parsedOverride !== undefined && (isNaN(parsedOverride) || parsedOverride < 1)) {
        setError(t('errorRunTimeOverride') ?? 'Run time override must be a whole number of at least 1')
        setSaving(false)
        return
      }
      const input: QueueBatchInput = {
        techId,
        techName,
        sampleIds: [],
        sampleCount,
        testType: testType.trim(),
        estimatedRunMinutes: parsedOverride,
      }
      const batch = await queueBatch(selectedInstrumentId, input)
      onSuccess(batch)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to queue batch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="queue-batch-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={t('queueBatch')}
    >
      <div className="w-full max-w-md rounded-xl bg-card shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t('queueBatch')}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Instrument selector */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('selectInstrument') ?? 'Instrument'} <span className="text-red-500">*</span>
          </label>
          <select
            className="form-input w-full"
            value={selectedInstrumentId}
            onChange={(e) => setSelectedInstrumentId(e.target.value)}
            data-testid="select-instrument"
          >
            <option value="">— {t('selectInstrument') ?? 'Select instrument'} —</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.type})
              </option>
            ))}
          </select>
          {instruments.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {t('noInServiceInstruments') ?? 'No in-service instruments available'}
            </p>
          )}
        </div>

        {/* Test type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('testType') ?? 'Test Type'} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="form-input w-full"
            value={testType}
            onChange={(e) => setTestType(e.target.value)}
            placeholder={t('testTypePlaceholder') ?? 'e.g. CBC, BMP, Urinalysis'}
            data-testid="test-type-input"
          />
        </div>

        {/* Sample count */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('sampleCount') ?? 'Sample Count'} <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            className="form-input w-full"
            value={sampleCount}
            onChange={(e) => setSampleCount(parseInt(e.target.value, 10) || 1)}
            data-testid="sample-count-input"
          />
        </div>

        {/* Run time override (optional) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('runTimeOverride') ?? 'Run Time Override (min, optional)'}
          </label>
          <input
            type="number"
            min={1}
            className="form-input w-full"
            value={runTimeOverride}
            onChange={(e) => setRunTimeOverride(e.target.value)}
            placeholder={t('runTimeOverridePlaceholder') ?? 'Leave blank to use instrument default'}
            data-testid="run-time-override-input"
          />
        </div>

        {/* Estimated wait */}
        {estimatedWaitMinutes !== null && (
          <p className="rounded bg-primary/10 px-3 py-2 text-sm text-primary" data-testid="estimated-wait">
            {t('estimatedWait') ?? 'Estimated wait'}: <strong>{formatWait(estimatedWaitMinutes)}</strong>
          </p>
        )}

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('cancel') ?? 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || instruments.length === 0} data-testid="confirm-queue-btn">
            {saving ? t('saving') ?? 'Queuing…' : t('queueBatch')}
          </Button>
        </div>
      </div>
    </div>
  )
}
