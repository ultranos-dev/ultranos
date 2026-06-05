'use client'

import { useTranslations } from 'next-intl'
import { useOrderSync } from '@/hooks/useOrderSync'
import { OrdersWorklist } from '@/components/orders/OrdersWorklist'

export default function OrdersPage() {
  const t = useTranslations('orders')
  const { orders, loading, error, refresh } = useOrderSync()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {t('title')}
        </h1>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {t('refresh', { defaultMessage: 'Refresh' })}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {error}
        </div>
      )}

      <OrdersWorklist orders={orders} loading={loading} />
    </div>
  )
}
