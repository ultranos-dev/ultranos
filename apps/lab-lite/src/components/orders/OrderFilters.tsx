'use client'

import { useTranslations } from 'next-intl'
import type { LabOrderStatus, OrderUrgency } from '@/lib/db'

export interface OrderFilterValues {
  status: LabOrderStatus | 'ALL'
  urgency: OrderUrgency | 'ALL'
}

interface OrderFiltersProps {
  value: OrderFilterValues
  onChange: (filters: OrderFilterValues) => void
}

const STATUS_OPTIONS: Array<LabOrderStatus | 'ALL'> = [
  'ALL',
  'RECEIVED',
  'IN_PROGRESS',
  'COMPLETED',
]

const URGENCY_OPTIONS: Array<OrderUrgency | 'ALL'> = [
  'ALL',
  'stat',
  'asap',
  'urgent',
  'routine',
]

export function OrderFilters({ value, onChange }: OrderFiltersProps) {
  const t = useTranslations('orders')

  return (
    <div className="flex flex-wrap gap-3">
      {/* Status filter */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ ...value, status: s })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value.status === s
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {s === 'ALL'
              ? t('filters.all')
              : s === 'IN_PROGRESS'
                ? t('filters.inProgress')
                : t(`filters.${s.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {/* Urgency filter */}
      <select
        value={value.urgency}
        onChange={(e) =>
          onChange({ ...value, urgency: e.target.value as OrderUrgency | 'ALL' })
        }
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      >
        <option value="ALL">{t('filters.all')}</option>
        {URGENCY_OPTIONS.filter((u) => u !== 'ALL').map((u) => (
          <option key={u} value={u}>
            {t(`urgency.${u}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
