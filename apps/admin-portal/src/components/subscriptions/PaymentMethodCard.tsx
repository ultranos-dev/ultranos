'use client'

import { Button } from '@/components/ui/button'

interface PaymentMethod {
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

interface PaymentMethodCardProps {
  method: PaymentMethod
  onUpdate: () => void
  onRemove: () => void
}

export function PaymentMethodCard({ method, onUpdate, onRemove }: PaymentMethodCardProps) {
  const expiry = `${String(method.expMonth).padStart(2, '0')}/${String(method.expYear).slice(-2)}`

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground uppercase tracking-wide">{method.brand}</p>
          <p className="mt-1 text-lg font-medium text-foreground">
            &bull;&bull;&bull;&bull; {method.last4}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">Expires {expiry}</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={onUpdate}>
            Update
          </Button>
          <Button variant="outline" onClick={onRemove} className="border-destructive text-destructive hover:bg-destructive/10">
            Remove
          </Button>
        </div>
      </div>
    </div>
  )
}
