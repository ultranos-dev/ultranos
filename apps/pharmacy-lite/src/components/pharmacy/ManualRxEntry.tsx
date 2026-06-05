'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
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
  const t = useTranslations('manualRx')
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
        setError(t('prescriptionNotFound'))
      }
    } catch {
      setError(t('prescriptionNotFound'))
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
        className="rounded-2xl border border-border bg-card p-4 shadow-card"
      >
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
          {t('graceDispensingHeading')}
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
      className="rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">
        {t('manualEntryHeading')}
      </h3>

      {/* Offline warning banner */}
      {!isOnline && (
        <div className="mb-3 rounded-2xl border border-warning/20 bg-warning/10 p-3">
          <p className="text-sm font-medium text-warning">
            {t('offlineWarning')}
          </p>
        </div>
      )}

      {/* Rx ID input */}
      <div className="mb-3">
        <label
          htmlFor="rx-id-input"
          className="block text-sm font-medium text-foreground mb-1"
        >
          {t('prescriptionIdLabel')}
        </label>
        <input
          id="rx-id-input"
          data-testid="rx-id-input"
          type="text"
          placeholder={t('rxIdPlaceholder')}
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
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Error message */}
      {error && (
        <div
          data-testid="rx-lookup-error"
          className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2"
        >
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {isOnline ? (
          <Button
            variant="default"
            className="flex-1"
            type="button"
            onClick={handleLookup}
            disabled={!rxId.trim() || isLoading}
            data-testid="rx-lookup-button"
          >
            {isLoading ? t('lookingUp') : t('lookUp')}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="flex-1 border-warning text-warning hover:bg-warning/10"
            type="button"
            onClick={() => setShowGraceForm(true)}
            data-testid="grace-dispense-button"
          >
            {t('proceedGraceDispensing')}
          </Button>
        )}
      </div>
    </div>
  )
}
