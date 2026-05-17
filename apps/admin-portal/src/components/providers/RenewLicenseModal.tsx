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
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Renew License</h2>
          <p className="text-sm text-neutral-500 mt-1">
            {provider.name} — {provider.licenseNumber}
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {showConfirmation ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
              <p className="text-sm text-amber-800 font-medium mb-2">
                Confirm License Renewal
              </p>
              <p className="text-sm text-amber-700">
                Renewing this license will require re-verification. Provider will be in{' '}
                <strong>PENDING_VERIFICATION</strong> status until reviewed.
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Renewing...' : 'Confirm Renewal'}
                </button>
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={submitting}
                  className="px-4 py-2 bg-white text-neutral-700 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-neutral-600 mb-2">
                  Current status: <strong>{provider.kycStatus}</strong>
                  {provider.daysRemaining !== null && (
                    <> — {provider.daysRemaining <= 0 ? 'Expired' : `${provider.daysRemaining} days remaining`}</>
                  )}
                </p>
              </div>

              <div>
                <label htmlFor="expiry-date" className="block text-sm font-medium text-neutral-700 mb-1">
                  New Expiry Date
                </label>
                <input
                  id="expiry-date"
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  min={new Date().toLocaleDateString('sv')}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="document-url" className="block text-sm font-medium text-neutral-700 mb-1">
                  Renewal Document URL
                </label>
                <input
                  id="document-url"
                  type="url"
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>

        {!showConfirmation && (
          <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white text-neutral-700 text-sm rounded-md border border-neutral-300 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitClick}
              disabled={!canSubmit}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Renew License
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
