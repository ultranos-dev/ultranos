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

      <OrdersWorklist orders={orders} loading={loading} error={error} onRefresh={refresh} />
    </div>
  )
}
