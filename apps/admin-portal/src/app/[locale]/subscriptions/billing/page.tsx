'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
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
  const t = useTranslations('subscriptions')
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
      setPaymentMethod(result.paymentMethod ?? null)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('billingErrorLoad'))
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
      await trpc.subscription.createPaymentSetup.mutate()
      setError('Inline payment form is pending. Please try again later.')
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to initiate payment setup')
    }
  }

  async function handleRemove() {
    try {
      setRemoving(true)
      setError(null)
      await trpc.subscription.removePaymentMethod.mutate()
      setPaymentMethod(null)
      setShowRemoveModal(false)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('billingRemoveError'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/subscriptions"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('billingBack')}
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">{t('billingPageTitle')}</h1>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="text-muted-foreground">{t('billingLoading')}</div>
        ) : paymentMethod ? (
          <PaymentMethodCard
            method={paymentMethod}
            onUpdate={handleAddOrUpdate}
            onRemove={() => setShowRemoveModal(true)}
          />
        ) : (
          <div className="rounded-xl border border-warning/20 bg-warning/10 p-6">
            <p className="text-sm font-medium text-warning">
              {t('billingNoPaymentMethod')}
            </p>
            <Button onClick={handleAddOrUpdate} className="mt-4">
              {t('billingAddPaymentMethod')}
            </Button>
          </div>
        )}

        {/* Remove Confirmation Modal */}
        <Dialog open={showRemoveModal} onOpenChange={setShowRemoveModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('billingRemoveTitle')}</DialogTitle>
              <DialogDescription>
                {t('billingRemoveDesc')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRemoveModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                {removing ? t('billingLoading') : t('billingRemoveCard')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}
