'use client'

/**
 * CheckInForm — Story 46.5 (Task 3)
 *
 * Form for completing a monthly mentorship check-in. Saves a CheckInRecord to
 * Dexie and updates the pairing's lastCheckInAt / nextCheckInDue.
 *
 * RTL-compatible: uses logical CSS properties and dir="auto" on text inputs.
 * All display strings sourced from the 'mentorship' next-intl namespace.
 *
 * No PHI: operates on mentorship data only. No patient data involved.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { X } from '@ultranos/ui-kit/icons'
import type { MentorshipPairing, CheckInRecord } from '@/lib/mentorship-types'
import { Button } from '@/components/ui/Button'

const MAX_GOALS = 5

/** ISO 8601 date string 30 days from now */
function thirtyDaysFromNow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString()
}

export interface CheckInFormProps {
  pairing: MentorshipPairing
  currentUserId: string
  onComplete: (record: CheckInRecord) => void
  onCancel: () => void
}

export function CheckInForm({
  pairing,
  currentUserId,
  onComplete,
  onCancel,
}: CheckInFormProps) {
  const t = useTranslations('mentorship')

  const [notes, setNotes] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ---------------------------------------------------------------------------
  // Goal list helpers
  // ---------------------------------------------------------------------------

  function handleGoalChange(index: number, value: string) {
    setGoals((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleAddGoal() {
    if (goals.length < MAX_GOALS) {
      setGoals((prev) => [...prev, ''])
    }
  }

  function handleRemoveGoal(index: number) {
    setGoals((prev) => prev.filter((_, i) => i !== index))
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validation
    if (!notes.trim()) {
      setNotesError(t('checkInNotesRequired'))
      return
    }
    setNotesError(null)

    setSaving(true)
    try {
      const completedAt = new Date().toISOString()
      const nextDue = thirtyDaysFromNow()

      const record: CheckInRecord = {
        id: crypto.randomUUID(),
        pairingId: pairing.id,
        completedBy: currentUserId,
        completedAt,
        notes: notes.trim(),
        menteeGoals: goals.map((g) => g.trim()).filter((g) => g.length > 0),
        syncStatus: 'pending',
      }

      const db = getDb()

      await db.transaction(
        'rw',
        [db.check_in_records, db.mentorship_pairings],
        async () => {
          await db.check_in_records.add(record)
          await db.mentorship_pairings.update(pairing.id, {
            lastCheckInAt: completedAt,
            nextCheckInDue: nextDue,
          })
        },
      )

      onComplete(record)
    } catch {
      // Surface a generic save error — no PHI in message
      setNotesError(t('checkInSaveError'))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Notes */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="check-in-notes"
          className="text-sm font-medium text-neutral-700"
        >
          {t('checkInNotesLabel')}
          <span className="ms-1 text-red-600" aria-hidden="true">*</span>
        </label>
        <p className="text-xs text-neutral-500">{t('checkInNotesHint')}</p>
        <textarea
          id="check-in-notes"
          dir="auto"
          rows={4}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            if (notesError) setNotesError(null)
          }}
          disabled={saving}
          required
          className="rounded-lg border border-neutral-300 px-4 py-3 text-sm text-start
            focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
            disabled:opacity-50"
          aria-describedby={notesError ? 'notes-error' : undefined}
        />
        {notesError && (
          <p id="notes-error" role="alert" className="text-xs text-red-600">
            {notesError}
          </p>
        )}
      </div>

      {/* Mentee Goals */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-neutral-700">
          {t('checkInGoalsLabel')}
          <span className="ms-1 text-xs font-normal text-neutral-500">
            {t('checkInGoalsOptional')}
          </span>
        </p>

        {goals.map((goal, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              dir="auto"
              value={goal}
              onChange={(e) => handleGoalChange(index, e.target.value)}
              disabled={saving}
              placeholder={t('checkInGoalPlaceholder', { number: index + 1 })}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm text-start
                focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500
                disabled:opacity-50"
              aria-label={t('checkInGoalAriaLabel', { number: index + 1 })}
            />
            {goals.length > 0 && (
              <button
                type="button"
                onClick={() => handleRemoveGoal(index)}
                disabled={saving}
                className="rounded p-1 text-neutral-400 hover:text-red-500
                  focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                aria-label={t('checkInGoalRemove', { number: index + 1 })}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}

        {goals.length < MAX_GOALS && (
          <button
            type="button"
            onClick={handleAddGoal}
            disabled={saving}
            className="self-start text-sm text-primary-600 underline-offset-2
              hover:underline focus:outline-none focus:ring-2 focus:ring-primary-300
              disabled:opacity-50"
          >
            {t('checkInAddGoal')}
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-200 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
        >
          {t('checkInCancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
        >
          {saving ? t('checkInSaving') : t('checkInSubmit')}
        </Button>
      </div>
    </form>
  )
}
