'use client'

import { useEffect, useState } from 'react'
import { getReferencePriceForAtc } from '@/lib/drug-catalog-queries'

/** Indicative reference price for a generic (from brand presentations) — distinct from retail. */
export function PriceCard({ atc }: { atc?: string }) {
  const [ref, setRef] = useState<{ min: number; currency: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!atc) { setRef(null); return }
    void getReferencePriceForAtc(atc).then((r) => { if (!cancelled) setRef(r) }).catch(() => { if (!cancelled) setRef(null) })
    return () => { cancelled = true }
  }, [atc])

  if (!ref) return null
  return (
    <span
      data-testid="price-card"
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
      title="Indicative trade price — not the retail price"
    >
      Indicative ref: {ref.currency} {ref.min.toFixed(2)}
    </span>
  )
}
