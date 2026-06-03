'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { ROLE_MODULE_MAP } from '@ultranos/shared-types'
import { Button } from '@/components/ui/button'

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
  const [affectedUserCount, setAffectedUserCount] = useState<number | null>(null)

  useEffect(() => {
    const affectedRoles = Object.entries(ROLE_MODULE_MAP)
      .filter(([, mod]) => mod === subscription.moduleCode)
      .map(([role]) => role)

    if (affectedRoles.length === 0) return

    trpc.admin.listUsers.query({ page: 1, pageSize: 1, roleFilter: affectedRoles[0], statusFilter: 'ACTIVE' })
      .then((r) => setAffectedUserCount(r.totalCount))
      .catch(() => {})
  }, [subscription.moduleCode])

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
        className="w-full max-w-md rounded-2xl bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">Remove Module</h2>

        {error && (
          <div className="mt-3 rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {affectedUserCount !== null && affectedUserCount > 0 && (
          <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            {affectedUserCount} active user(s) with roles requiring this module will be suspended when the billing period ends.
          </div>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Are you sure you want to cancel <span className="font-semibold text-foreground">{subscription.moduleName}</span>?
          Access continues until the end of the current billing period ({formatDate(subscription.expiresAt)}).
        </p>

        {isLastActive && (
          <div className="mt-3 rounded-2xl border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
            This is your only active module. Cancelling will leave your organization without any active services.
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Keep Subscription
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
          </Button>
        </div>
      </div>
    </div>
  )
}
