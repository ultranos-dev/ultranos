'use client'

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
    <div className="rounded-3xl border border-border bg-white p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground uppercase tracking-wide">{method.brand}</p>
          <p className="mt-1 text-lg font-medium text-foreground">
            &bull;&bull;&bull;&bull; {method.last4}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">Expires {expiry}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onUpdate}
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Update
          </button>
          <button
            onClick={onRemove}
            className="rounded-full border border-destructive px-5 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
