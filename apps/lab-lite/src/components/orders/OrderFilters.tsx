'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown } from '@ultranos/ui-kit/icons'
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

  // `contents` so the pill group and select flow into the parent toolbar row.
  return (
    <div className="contents">
      {/* Status filter — OPD pill tabs */}
      <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-pressed={value.status === s}
            onClick={() => onChange({ ...value, status: s })}
            className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
              value.status === s
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
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
      <div className="relative">
        <select
          value={value.urgency}
          onChange={(e) =>
            onChange({ ...value, urgency: e.target.value as OrderUrgency | 'ALL' })
          }
          className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
          aria-label={t('filters.all')}
        >
          <option value="ALL">{t('filters.all')}</option>
          {URGENCY_OPTIONS.filter((u) => u !== 'ALL').map((u) => (
            <option key={u} value={u}>
              {t(`urgency.${u}`)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  )
}
