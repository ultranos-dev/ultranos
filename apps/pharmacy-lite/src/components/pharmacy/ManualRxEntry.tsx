'use client'

import { useState } from 'react'
import { OfflineGraceForm } from './OfflineGraceForm'

interface ManualRxEntryProps {
  onPrescriptionFound: (prescription: {
    id: string
    medications: string[]
  }) => void
  onGraceDispense: (graceData: {
    reason: string
    supervisorId: string
  }) => void
  isOnline: boolean
}

export function ManualRxEntry({
  onPrescriptionFound,
  onGraceDispense,
  isOnline,
}: ManualRxEntryProps) {
  const [rxId, setRxId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGraceForm, setShowGraceForm] = useState(false)

  async function handleLookup() {
    const trimmedId = rxId.trim()
    if (!trimmedId) return

    setError(null)
    setIsLoading(true)

    try {
      // Dynamic import to avoid bundling trpc client when offline
      const { trpc } = await import('@/lib/trpc')
      const result = await trpc.medication.getPrescription.query({
        prescriptionId: trimmedId,
      })

      if (result) {
        onPrescriptionFound({
          id: result.id,
          medications: result.medications,
        })
      } else {
        setError('Prescription not found')
      }
    } catch {
      setError('Prescription not found')
    } finally {
      setIsLoading(false)
    }
  }

  function handleGraceSubmit(data: { reason: string; supervisorId: string }) {
    setShowGraceForm(false)
    onGraceDispense(data)
  }

  if (showGraceForm) {
    return (
      <div
        data-testid="manual-rx-entry"
        className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-neutral-600 mb-3">
          Grace Dispensing
        </h3>
        <OfflineGraceForm
          onSubmit={handleGraceSubmit}
          onCancel={() => setShowGraceForm(false)}
        />
      </div>
    )
  }

  return (
    <div
      data-testid="manual-rx-entry"
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-neutral-600 mb-3">
        Manual Prescription Entry
      </h3>

      {/* Offline warning banner */}
      {!isOnline && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            You are offline. Use grace dispensing for urgent prescriptions.
          </p>
        </div>
      )}

      {/* Rx ID input */}
      <div className="mb-3">
        <label
          htmlFor="rx-id-input"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Prescription ID
        </label>
        <input
          id="rx-id-input"
          data-testid="rx-id-input"
          type="text"
          placeholder="Enter Rx ID (UUID or short code)"
          value={rxId}
          onChange={(e) => {
            setRxId(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isOnline) {
              handleLookup()
            }
          }}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Error message */}
      {error && (
        <div
          data-testid="rx-lookup-error"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2"
        >
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {isOnline ? (
          <button
            type="button"
            onClick={handleLookup}
            disabled={!rxId.trim() || isLoading}
            data-testid="rx-lookup-button"
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Looking up...' : 'Look Up'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowGraceForm(true)}
            data-testid="grace-dispense-button"
            className="flex-1 rounded-lg border border-amber-400 bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
          >
            Proceed with Grace Dispensing
          </button>
        )}
      </div>
    </div>
  )
}
