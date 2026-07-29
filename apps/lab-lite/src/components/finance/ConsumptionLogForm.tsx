'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  addReagentConsumptionLog,
  updateReagent,
  enqueueSyncEvent,
  getReagentByReagentId,
} from '@/lib/db'
import { reportReagentEvent } from '@/lib/audit-client'
import { hlc, serializeHlc } from '@/lib/hlc'
import type { ReagentInventoryEntry } from '@/lib/db'
import { calculateConsumptionEfficiency } from '@/lib/reagent-waste-service'

interface ConsumptionLogFormProps {
  reagent: ReagentInventoryEntry
  onSuccess?: () => void
}

export function ConsumptionLogForm({ reagent, onSuccess }: ConsumptionLogFormProps) {
  const t = useTranslations('finance.reagent.consumption')
  const session = useAuthSessionStore((s) => s.session)

  const [testsConsumed, setTestsConsumed] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [currentReagent, setCurrentReagent] = useState(reagent)

  const efficiency = calculateConsumptionEfficiency(currentReagent)
  const progressPct = Math.round(efficiency * 100)

  const validate = useCallback((): string[] => {
    const errs: string[] = []
    const n = parseInt(testsConsumed, 10)
    if (!testsConsumed || isNaN(n) || n <= 0) errs.push(t('errorTestsPositive'))
    return errs
  }, [testsConsumed, t])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const errs = validate()
      if (errs.length > 0) {
        setErrors(errs)
        return
      }
      setErrors([])
      setSubmitting(true)

      try {
        const consumed = parseInt(testsConsumed, 10)
        const now = new Date().toISOString()
        const hlcTs = serializeHlc(hlc.now())
        const actorId = session?.userId ?? 'unknown'

        await addReagentConsumptionLog({
          reagentId: reagent.reagentId,
          testsConsumed: consumed,
          loggedAt: now,
          loggedBy: actorId,
          notes: notes.trim() || null,
        })

        const newTestsPerformed = currentReagent.testsPerformed + consumed
        await updateReagent(reagent.reagentId, {
          testsPerformed: newTestsPerformed,
          hlcTimestamp: hlcTs,
          syncStatus: 'pending',
        })

        await enqueueSyncEvent({
          resourceType: 'ReagentInventory',
          resourceId: reagent.reagentId,
          payload: { testsPerformed: newTestsPerformed },
          hlcTimestamp: hlcTs,
        })

        reportReagentEvent({
          action: 'REAGENT_CONSUMPTION_LOGGED',
          reagentId: reagent.reagentId,
          actorId,
        })

        // Refresh local state
        const updated = await getReagentByReagentId(reagent.reagentId)
        if (updated) setCurrentReagent(updated)

        setTestsConsumed('')
        setNotes('')
        onSuccess?.()
      } finally {
        setSubmitting(false)
      }
    },
    [validate, testsConsumed, notes, reagent, currentReagent, session, onSuccess],
  )

  const handleQuickLog = useCallback(async () => {
    setTestsConsumed('1')
    // Submit immediately after state update
    const errs: string[] = []
    setErrors(errs)
    setSubmitting(true)

    try {
      const now = new Date().toISOString()
      const hlcTs = serializeHlc(hlc.now())
      const actorId = session?.userId ?? 'unknown'

      await addReagentConsumptionLog({
        reagentId: reagent.reagentId,
        testsConsumed: 1,
        loggedAt: now,
        loggedBy: actorId,
        notes: null,
      })

      const newTestsPerformed = currentReagent.testsPerformed + 1
      await updateReagent(reagent.reagentId, {
        testsPerformed: newTestsPerformed,
        hlcTimestamp: hlcTs,
        syncStatus: 'pending',
      })

      await enqueueSyncEvent({
        resourceType: 'ReagentInventory',
        resourceId: reagent.reagentId,
        payload: { testsPerformed: newTestsPerformed },
        hlcTimestamp: hlcTs,
      })

      reportReagentEvent({
        action: 'REAGENT_CONSUMPTION_LOGGED',
        reagentId: reagent.reagentId,
        actorId,
      })

      const updated = await getReagentByReagentId(reagent.reagentId)
      if (updated) setCurrentReagent(updated)
      setTestsConsumed('')
      onSuccess?.()
    } finally {
      setSubmitting(false)
    }
  }, [reagent, currentReagent, session, onSuccess])

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>{t('testsPerformed', { count: currentReagent.testsPerformed })}</span>
          <span>{t('expectedTests', { count: currentReagent.expectedTests })}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('progressLabel')}
          className="h-2 rounded-full bg-muted overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all ${
              progressPct >= 80
                ? 'bg-green-500'
                : progressPct >= 50
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('efficiency', { pct: progressPct })}</p>
      </div>

      {/* Quick-log button */}
      <Button
        type="button"
        variant="secondary"
        onClick={handleQuickLog}
        disabled={submitting}
        className="w-full"
      >
        {t('quickLog')}
      </Button>

      {/* Full log form */}
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {errors.length > 0 && (
          <ul
            role="alert"
            className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1"
          >
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="tests-consumed">
            {t('testsConsumedLabel')} <span aria-hidden>*</span>
          </label>
          <input
            id="tests-consumed"
            type="number"
            required
            min={1}
            value={testsConsumed}
            onChange={(e) => setTestsConsumed(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="consumption-notes">
            {t('notes')}
          </label>
          <input
            id="consumption-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? t('saving') : t('logUsage')}
        </Button>
      </form>
    </div>
  )
}
