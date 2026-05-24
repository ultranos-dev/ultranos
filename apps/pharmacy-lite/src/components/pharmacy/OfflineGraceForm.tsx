'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

const GRACE_DISPENSE_KEY = 'grace_dispense_count'
const MAX_GRACE_DISPENSES = 5

function getGraceCount(): number {
  if (typeof window === 'undefined') return 0
  const stored = sessionStorage.getItem(GRACE_DISPENSE_KEY)
  return stored ? parseInt(stored, 10) : 0
}

function incrementGraceCount(): void {
  const current = getGraceCount()
  sessionStorage.setItem(GRACE_DISPENSE_KEY, String(current + 1))
}

interface OfflineGraceFormProps {
  onSubmit: (data: { reason: string; supervisorId: string }) => void
  onCancel: () => void
}

export function OfflineGraceForm({ onSubmit, onCancel }: OfflineGraceFormProps) {
  const [supervisorName, setSupervisorName] = useState('')
  const [reason, setReason] = useState('')
  const [graceCount, setGraceCount] = useState(0)

  useEffect(() => {
    setGraceCount(getGraceCount())
  }, [])

  const isLimitReached = graceCount >= MAX_GRACE_DISPENSES
  const isReasonValid = reason.trim().length >= 10 && reason.trim().length <= 500
  const isSupervisorValid = supervisorName.trim().length > 0
  const canSubmit = isReasonValid && isSupervisorValid && !isLimitReached

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    incrementGraceCount()
    setGraceCount((prev) => prev + 1)
    onSubmit({ reason: reason.trim(), supervisorId: supervisorName.trim() })
  }

  return (
    <form
      data-testid="offline-grace-form"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {/* Warning banner */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm font-medium text-amber-800">
          Grace dispensing creates an unverified record that must be reviewed
          when connectivity returns.
        </p>
      </div>

      {/* Limit reached banner */}
      {isLimitReached && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">
            Maximum grace dispenses reached for this shift ({MAX_GRACE_DISPENSES}/{MAX_GRACE_DISPENSES})
          </p>
        </div>
      )}

      {/* Supervisor input */}
      <div>
        <label
          htmlFor="supervisor-name"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Supervisor Name
        </label>
        <input
          id="supervisor-name"
          data-testid="supervisor-input"
          type="text"
          placeholder="Enter supervisor name"
          value={supervisorName}
          onChange={(e) => setSupervisorName(e.target.value)}
          disabled={isLimitReached}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-neutral-100 disabled:text-neutral-400"
        />
      </div>

      {/* Reason textarea */}
      <div>
        <label
          htmlFor="grace-reason"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Reason for Grace Dispensing
        </label>
        <textarea
          id="grace-reason"
          data-testid="grace-reason-input"
          placeholder="Describe the reason for grace dispensing (min 10 characters)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isLimitReached}
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-neutral-100 disabled:text-neutral-400"
        />
        <div className="mt-1 flex justify-between text-xs text-neutral-400">
          <span>
            {reason.trim().length < 10
              ? `${10 - reason.trim().length} more characters needed`
              : 'Valid'}
          </span>
          <span>{reason.length}/500</span>
        </div>
      </div>

      {/* Grace count indicator */}
      <div className="text-xs text-neutral-500">
        Grace dispenses this shift: {graceCount}/{MAX_GRACE_DISPENSES}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="warning"
          className="flex-1"
          type="submit"
          disabled={!canSubmit}
          data-testid="grace-submit-button"
        >
          Submit Grace Dispense
        </Button>
      </div>
    </form>
  )
}
