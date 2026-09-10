'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { queryMovements } from '@/lib/inventory/stock-movement'
import type { StockMovement } from '@/lib/inventory/types'

interface Props {
  catalogItemId: string
  productName: string
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function StockHistorySheet({ catalogItemId, productName, open, onOpenChange }: Props) {
  const t = useTranslations('inventory')
  const [moves, setMoves] = useState<StockMovement[]>([])

  useEffect(() => {
    if (!open) return
    queryMovements({ catalogItemId, limit: 200 }).then(setMoves)
  }, [open, catalogItemId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('ledgerHistoryFor', { name: productName })}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 divide-y divide-border">
          {moves.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex flex-col">
                <span className="text-foreground">{t(`movement_${m.type}`)}</span>
                <span className="text-xs text-muted-foreground font-numeric">{m.timestamp.slice(0, 16).replace('T', ' ')}</span>
              </div>
              <span className={`font-numeric ${m.quantity < 0 ? 'text-destructive' : 'text-success'}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
