'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { PaymentMethodCard } from '@/components/subscriptions/PaymentMethodCard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface PaymentMethod {
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

export default function BillingPage() {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [removing, setRemoving] = useState(false)

  const fetchPaymentMethod = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.subscription.getPaymentMethod.query()
      setPaymentMethod(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load payment method')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPaymentMethod()
  }, [fetchPaymentMethod])

  async function handleAddOrUpdate() {
    try {
      setError(null)
      const result = await trpc.subscription.createPaymentSetup.mutate()
      if (result?.redirectUrl) {
        window.location.href = result.redirectUrl
      } else {
        setError('Inline payment form is pending. Please try again later.')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to initiate payment setup')
    }
  }

  async function handleRemove() {
    try {
      setRemoving(true)
      setError(null)
      await trpc.subscription.removePaymentMethod.mutate()
      setPaymentMethod(null)
      setShowRemoveModal(false)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove payment method')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <TopHeader title="Billing" />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link
          href="/subscriptions"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to Subscriptions
        </Link>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading billing details...</div>
        ) : paymentMethod ? (
          <div className="mt-6">
            <PaymentMethodCard
              method={paymentMethod}
              onUpdate={handleAddOrUpdate}
              onRemove={() => setShowRemoveModal(true)}
            />
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-warning/20 bg-warning/10 p-6">
            <p className="text-sm font-medium text-warning">
              No payment method on file. Add one to continue your subscription after the trial period.
            </p>
            <Button onClick={handleAddOrUpdate} className="mt-4">
              Add Payment Method
            </Button>
          </div>
        )}

        {/* Remove Confirmation Modal */}
        <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Remove Payment Method?</DialogTitle>
              <DialogDescription>
                Your subscription will be suspended if no payment method is on file at your next billing date.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRemoveModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                {removing ? 'Removing...' : 'Remove'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
