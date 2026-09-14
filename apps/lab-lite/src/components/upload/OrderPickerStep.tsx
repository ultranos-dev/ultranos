'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ClipboardList } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Button } from '@/components/ui/Button'
import { getOrders, type LabOrderEntry } from '@/lib/db'

interface OrderPickerProps {
  /** Called when the technician selects an order. */
  onOrderSelected: (selection: {
    patient: { patientRef: string; patientFirstName: string; patientAge: number }
    orderId: string
  }) => void
  /** Called when the technician chooses to upload without an order. */
  onSkip: () => void
}

/**
 * SELECT_ORDER step of the Upload wizard.
 *
 * Lists actionable orders (RECEIVED | IN_PROGRESS) from the local Dexie cache.
 * Displays ONLY: patientFirstName, patientAge, testsRequested, orderingPhysicianName.
 * No National ID, no raw patient UUID — CLAUDE.md Rule #7.
 */
export function OrderPickerStep({ onOrderSelected, onSkip }: OrderPickerProps) {
  const t = useTranslations('orderPicker')
  const [orders, setOrders] = useState<LabOrderEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const all = await getOrders()
        if (!cancelled) {
          setOrders(all.filter((o) => o.status === 'RECEIVED' || o.status === 'IN_PROGRESS'))
        }
      } catch {
        // Offline / DB unavailable — show empty state so tech can still proceed
        if (!cancelled) setOrders([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function handleSelect(order: LabOrderEntry) {
    onOrderSelected({
      patient: {
        patientRef: order.patientRef,
        patientFirstName: order.patientFirstName,
        patientAge: order.patientAge ?? 0,
      },
      orderId: order.orderId,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <span className="text-sm text-muted-foreground">{t('loading')}</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={ClipboardList}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={{ label: t('uploadWithoutOrder'), onClick: onSkip }}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border" role="list" aria-label={t('ordersListAriaLabel')}>
            {orders.map((order) => (
              <li key={order.orderId} className="px-4 py-3 hover:bg-muted/50">
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() => handleSelect(order)}
                  aria-label={t('selectOrderAriaLabel', {
                    name: order.patientFirstName,
                    age: order.patientAge ?? '—',
                  })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        {order.patientFirstName}
                        {', '}
                        {order.patientAge !== null ? t('ageYears', { age: order.patientAge }) : '—'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {order.testsRequested.map((tr) => tr.loincDisplay).join(', ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('orderedBy', { name: order.orderingPhysicianName })}
                      </span>
                    </div>
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.urgency === 'stat' || order.urgency === 'asap'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {order.urgency.toUpperCase()}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        variant="outline"
        type="button"
        onClick={onSkip}
        className="w-fit"
      >
        {t('uploadWithoutOrder')}
      </Button>
    </div>
  )
}
