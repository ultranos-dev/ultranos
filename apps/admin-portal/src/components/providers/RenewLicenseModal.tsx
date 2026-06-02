'use client'

import { useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'

interface Provider {
  practitionerId: string
  name: string
  licenseNumber: string
  kycStatus: string
  expiryDate: string
  daysRemaining: number | null
}

interface RenewLicenseModalProps {
  provider: Provider
  onClose: () => void
  onRenewed: () => void
}

export function RenewLicenseModal({ provider, onClose, onRenewed }: RenewLicenseModalProps) {
  const mounted = useRef(true)
  const [newExpiryDate, setNewExpiryDate] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const canSubmit = newExpiryDate && documentUrl && !submitting

  function handleSubmitClick() {
    if (!canSubmit) return
    setShowConfirmation(true)
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      await trpc.admin.renewProviderLicense.mutate({
        practitionerId: provider.practitionerId,
        newExpiryDate,
        documentUrl,
      })
      if (mounted.current) {
        onRenewed()
      }
    } catch {
      if (mounted.current) {
        setError('Failed to renew license. Please try again.')
        setShowConfirmation(false)
      }
    } finally {
      if (mounted.current) setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="rounded-2xl bg-popover p-6 shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Renew License</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {provider.name} — {provider.licenseNumber}
          </p>
        </div>

        <div className="pt-4 space-y-4">
          {error && (
            <div className="rounded-2xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {showConfirmation ? (
            <div className="rounded-2xl border border-warning/20 bg-warning/10 p-4">
              <p className="text-sm text-warning font-medium mb-2">
                Confirm License Renewal
              </p>
              <p className="text-sm text-warning">
                Renewing this license will require re-verification. Provider will be in{' '}
                <strong>PENDING_VERIFICATION</strong> status until reviewed.
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="rounded-full bg-primary text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
                >
                  {submitting ? 'Renewing...' : 'Confirm Renewal'}
                </button>
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={submitting}
                  className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-card hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Current status: <strong>{provider.kycStatus}</strong>
                  {provider.daysRemaining !== null && (
                    <> — {provider.daysRemaining <= 0 ? 'Expired' : `${provider.daysRemaining} days remaining`}</>
                  )}
                </p>
              </div>

              <div>
                <label htmlFor="expiry-date" className="block text-sm font-medium text-muted-foreground mb-1">
                  New Expiry Date
                </label>
                <input
                  id="expiry-date"
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  min={new Date().toLocaleDateString('sv')}
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label htmlFor="document-url" className="block text-sm font-medium text-muted-foreground mb-1">
                  Renewal Document URL
                </label>
                <input
                  id="document-url"
                  type="url"
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </>
          )}
        </div>

        {!showConfirmation && (
          <div className="pt-4 border-t border-border mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-card hover:scale-[1.02] transition-transform duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitClick}
              disabled={!canSubmit}
              className="rounded-full bg-primary text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Renew License
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
