'use client'

import { useTranslations } from 'next-intl'
import { useOrderSync } from '@/hooks/useOrderSync'
import { OrdersWorklist } from '@/components/orders/OrdersWorklist'

export default function OrdersPage() {
  const t = useTranslations('orders')
  const { orders, loading, error, refresh } = useOrderSync()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('title')}
      </h1>

      {error && (
        <div className="rounded-2xl bg-warning/10 p-3 text-sm text-warning">
          {error}
        </div>
      )}

      <OrdersWorklist orders={orders} loading={loading} onRefresh={refresh} />
    </div>
  )
}
