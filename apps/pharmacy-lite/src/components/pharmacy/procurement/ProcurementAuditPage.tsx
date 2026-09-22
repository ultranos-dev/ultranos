'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ScrollText, ChevronDown } from '@ultranos/ui-kit/icons'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import {
  getProcurementAuditEvents,
  PROCUREMENT_RESOURCE_TYPES,
} from '@/lib/procurement/audit'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'

function actionLabel(a: AuditAction): string {
  switch (a) {
    case AuditAction.PO_CREATED:                return 'actionPoCreated'
    case AuditAction.PO_SENT:                   return 'actionPoSent'
    case AuditAction.PO_CANCELLED:              return 'actionPoCancelled'
    case AuditAction.GOODS_RECEIVED:            return 'actionGoodsReceived'
    case AuditAction.GOODS_RECEIPT_REVERSED:    return 'actionGoodsReceiptReversed'
    case AuditAction.SUPPLIER_INVOICE_CREATED:  return 'actionInvoiceCreated'
    case AuditAction.SUPPLIER_INVOICE_APPROVED: return 'actionInvoiceApproved'
    case AuditAction.SUPPLIER_INVOICE_DISPUTED: return 'actionInvoiceDisputed'
    case AuditAction.SUPPLIER_PAYMENT_RECORDED: return 'actionPaymentRecorded'
    case AuditAction.SUPPLIER_PAYMENT_VOIDED:   return 'actionPaymentVoided'
    case AuditAction.BATCH_QC_HELD:             return 'actionBatchQcHeld'
    case AuditAction.BATCH_QC_RELEASED:         return 'actionBatchQcReleased'
    default:                                     return a
  }
}

function resourceLabel(rt: AuditResourceType): string {
  switch (rt) {
    case AuditResourceType.PURCHASE_ORDER:   return 'resourcePurchaseOrder'
    case AuditResourceType.SUPPLIER_INVOICE: return 'resourceSupplierInvoice'
    case AuditResourceType.SUPPLIER_PAYMENT: return 'resourceSupplierPayment'
    case AuditResourceType.GOODS_RECEIPT:    return 'resourceGoodsReceipt'
    case AuditResourceType.STOCK_BATCH:      return 'resourceStockBatch'
    default:                                  return rt
  }
}

const PROCUREMENT_ACTIONS: AuditAction[] = [
  AuditAction.PO_CREATED,
  AuditAction.PO_SENT,
  AuditAction.PO_CANCELLED,
  AuditAction.GOODS_RECEIVED,
  AuditAction.GOODS_RECEIPT_REVERSED,
  AuditAction.SUPPLIER_INVOICE_CREATED,
  AuditAction.SUPPLIER_INVOICE_APPROVED,
  AuditAction.SUPPLIER_INVOICE_DISPUTED,
  AuditAction.SUPPLIER_PAYMENT_RECORDED,
  AuditAction.SUPPLIER_PAYMENT_VOIDED,
  AuditAction.BATCH_QC_HELD,
  AuditAction.BATCH_QC_RELEASED,
]

interface Filter {
  resourceType?: AuditResourceType
  action?: AuditAction
  search: string
}

export function ProcurementAuditPage() {
  const t = useTranslations('audit')
  const [events, setEvents] = useState<ClientAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>({ search: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getProcurementAuditEvents({
        resourceType: filter.resourceType,
        action: filter.action,
        search: filter.search || undefined,
      })
      setEvents(data)
    } catch (err) {
      console.error('[ProcurementAuditPage] load failed:', err instanceof Error ? err.message : 'unknown')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: search → resource filter → action filter */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={filter.search}
          onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
          placeholder={t('searchPlaceholder')}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
        />

        <div className="relative">
          <select
            value={filter.resourceType ?? ''}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                resourceType: e.target.value ? (e.target.value as AuditResourceType) : undefined,
              }))
            }
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
          >
            <option value="">{t('filterAllResources')}</option>
            {PROCUREMENT_RESOURCE_TYPES.map((rt) => (
              <option key={rt} value={rt}>{t(resourceLabel(rt))}</option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={filter.action ?? ''}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                action: e.target.value ? (e.target.value as AuditAction) : undefined,
              }))
            }
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
          >
            <option value="">{t('filterAllActions')}</option>
            {PROCUREMENT_ACTIONS.map((a) => (
              <option key={a} value={a}>{t(actionLabel(a))}</option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={ScrollText} title={t('loading')} />
          </div>
        ) : events.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={ScrollText}
              title={t('empty')}
              description={t('emptyDescription')}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colWhen')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colAction')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colResource')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colReference')}
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t('colActor')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground font-numeric text-xs tabular-nums">
                    {new Date(e.hlcTimestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {t(actionLabel(e.action as AuditAction))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t(resourceLabel(e.resourceType as AuditResourceType))}
                  </td>
                  <td className="px-4 py-3 text-foreground font-numeric text-xs">
                    {(e.metadata as Record<string, unknown> | undefined)?.poNumber as string | undefined
                      ?? (e.metadata as Record<string, unknown> | undefined)?.invoiceNumber as string | undefined
                      ?? (e.metadata as Record<string, unknown> | undefined)?.batchNumber as string | undefined
                      ?? e.resourceId}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {e.actorId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
