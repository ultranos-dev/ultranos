'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { ROLE_MODULE_MAP } from '@ultranos/shared-types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Subscription {
  id: string
  moduleName: string
  moduleCode: string
  expiresAt: string | null
}

interface RemoveModuleDialogProps {
  subscription: Subscription
  isLastActive: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onModuleRemoved: () => void
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'the end of the current billing period'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function RemoveModuleDialog({ subscription, isLastActive, open, onOpenChange, onModuleRemoved }: RemoveModuleDialogProps) {
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
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to cancel subscription')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Module</DialogTitle>
          <DialogDescription className="sr-only">Confirm removal of this subscription module</DialogDescription>
        </DialogHeader>

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

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep Subscription
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
