'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'

interface Subscription {
  id: string
  moduleName: string
  moduleCode: string
  expiresAt: string | null
}

interface RemoveModuleDialogProps {
  subscription: Subscription
  isLastActive: boolean
  onClose: () => void
  onModuleRemoved: () => void
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'the end of the current billing period'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function RemoveModuleDialog({ subscription, isLastActive, onClose, onModuleRemoved }: RemoveModuleDialogProps) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    try {
      setCancelling(true)
      setError(null)
      await trpc.subscription.removeModule.mutate({ subscriptionId: subscription.id })
      onModuleRemoved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to cancel subscription')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary">Remove Module</h2>

        {error && (
          <div className="mt-3 rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">{error}</div>
        )}

        <p className="mt-4 text-sm text-text-secondary">
          Are you sure you want to cancel <span className="font-semibold text-text-primary">{subscription.moduleName}</span>?
          Access continues until the end of the current billing period ({formatDate(subscription.expiresAt)}).
        </p>

        {isLastActive && (
          <div className="mt-3 rounded-2xl border border-warning/20 bg-warning-subtle p-3 text-sm text-warning">
            This is your only active module. Cancelling will leave your organization without any active services.
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Keep Subscription
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-full bg-danger text-white font-semibold px-6 py-2.5 hover:opacity-90 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
          </button>
        </div>
      </div>
    </div>
  )
}
