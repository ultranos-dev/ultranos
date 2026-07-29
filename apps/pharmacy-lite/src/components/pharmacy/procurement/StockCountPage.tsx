'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { ClipboardList } from '@ultranos/ui-kit/icons'
import { StockCountForm } from './StockCountForm'
import {
  startStockCount,
  getActiveStockCount,
  getRecentStockCounts,
} from '@/lib/procurement/stock-count-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { StockCount, StockCountType } from '@/lib/procurement/types'

export function StockCountPage() {
  const t = useTranslations('procurement')
  const tApp = useTranslations('app')
  const [activeCount, setActiveCount] = useState<StockCount | null>(null)
  const [recentCounts, setRecentCounts] = useState<StockCount[]>([])
  const [loading, setLoading] = useState(true)
  const session = useAuthSessionStore((s) => s.session)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [active, recent] = await Promise.all([
        getActiveStockCount(),
        getRecentStockCounts(),
      ])
      setActiveCount(active)
      setRecentCounts(recent)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleStart(type: StockCountType) {
    if (!session) return
    const count = await startStockCount({ type, countedBy: session.practitionerId })
    setActiveCount(count)
  }

  function handleCompleted() {
    setActiveCount(null)
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">{tApp('loading')}</p>
      </div>
    )
  }

  if (activeCount) {
    return <StockCountForm count={activeCount} onCompleted={handleCompleted} />
  }

  const typeLabels: Record<string, string> = {
    full: t('fullCount'),
    spot: t('spotCheck'),
    controlled_only: t('controlledOnly'),
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('stockCountTitle')}</h1>

      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <p className="text-sm text-muted-foreground">{t('startNewCount')}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Button
            variant="default"
            className="w-full py-6 text-base"
            onClick={() => handleStart('full')}
          >
            {t('fullCount')}
          </Button>
          <Button
            variant="secondary"
            className="w-full py-6 text-base"
            onClick={() => handleStart('spot')}
          >
            {t('spotCheck')}
          </Button>
          <Button
            variant="destructive"
            className="w-full py-6 text-base"
            onClick={() => handleStart('controlled_only')}
          >
            {t('controlledOnly')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h2 className="text-sm font-semibold text-foreground">{t('recentCounts')}</h2>
        {recentCounts.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={ClipboardList}
            title={t('noRecentCountsTitle')}
            description={t('noRecentCountsDescription')}
          />
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl ring-[0.65px] ring-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('typeCol')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('completedCol')}</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('itemsCol')}</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('variancesCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentCounts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {typeLabels[c.type]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.completedAt ? new Date(c.completedAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3 text-end text-muted-foreground">{c.items.length}</td>
                    <td className="px-4 py-3 text-end">
                      <span
                        className={
                          c.totalVarianceItems > 0 ? 'font-medium text-warning' : 'text-muted-foreground'
                        }
                      >
                        {c.totalVarianceItems}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
