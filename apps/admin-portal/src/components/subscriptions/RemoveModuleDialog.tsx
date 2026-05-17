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
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Remove Module</h2>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <p className="mt-4 text-sm text-neutral-700">
          Are you sure you want to cancel <span className="font-semibold">{subscription.moduleName}</span>?
          Access continues until the end of the current billing period ({formatDate(subscription.expiresAt)}).
        </p>

        {isLastActive && (
          <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            This is your only active module. Cancelling will leave your organization without any active services.
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Keep Subscription
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
          </button>
        </div>
      </div>
    </div>
  )
}
