'use client'

import { useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenewed: () => void
}

export function RenewLicenseModal({ provider, open, onOpenChange, onRenewed }: RenewLicenseModalProps) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renew License</DialogTitle>
          <DialogDescription>
            {provider.name} — {provider.licenseNumber}
          </DialogDescription>
        </DialogHeader>

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
                <Button
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting ? 'Renewing...' : 'Confirm Renewal'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmation(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
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
                <Input
                  id="expiry-date"
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  min={new Date().toLocaleDateString('sv')}
                />
              </div>

              <div>
                <label htmlFor="document-url" className="block text-sm font-medium text-muted-foreground mb-1">
                  Renewal Document URL
                </label>
                <Input
                  id="document-url"
                  type="url"
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </>
          )}
        </div>

        {!showConfirmation && (
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitClick}
              disabled={!canSubmit}
            >
              Renew License
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
