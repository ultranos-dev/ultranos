'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ReceiveStockForm } from './ReceiveStockForm'

export function ReceiveStockPage() {
  const t = useTranslations('inventory')
  const router = useRouter()
  const [showSuccess, setShowSuccess] = useState(false)
  const locationId = 'default'
  const currencyMinorUnits = 2

  if (showSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('receiveStock')}</h1>
        <div className="rounded-xl bg-card p-5 text-center shadow-card ring-[0.65px] ring-success/40" data-testid="receipt-success">
          <p className="text-lg font-bold text-success">{t('stockReceivedSuccess')}</p>
          <p className="mt-1 text-sm text-success">{t('itemsAddedToInventory')}</p>
          <div className="mt-4 flex justify-center gap-3">
            <button type="button" onClick={() => setShowSuccess(false)} className="text-sm font-semibold text-primary hover:text-primary/80">{t('receiveMore')}</button>
            <button type="button" onClick={() => router.push('/inventory')} className="text-sm font-semibold text-muted-foreground hover:text-foreground">{t('viewStock')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('receiveStock')}</h1>
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <p className="text-sm text-muted-foreground">{t('searchOrScanProduct')}</p>
        <div className="mt-4">
          <ReceiveStockForm locationId={locationId} currencyMinorUnits={currencyMinorUnits} onComplete={() => setShowSuccess(true)} />
        </div>
      </div>
    </div>
  )
}
