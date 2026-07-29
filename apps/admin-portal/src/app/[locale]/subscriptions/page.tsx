'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { AddModuleDialog } from '@/components/subscriptions/AddModuleDialog'
import { RemoveModuleDialog } from '@/components/subscriptions/RemoveModuleDialog'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CreditCard } from '@ultranos/ui-kit/icons'

interface OrgInfo {
  id: string
  name: string
  status: string
  trialEndsAt: string | null
  billingEmail: string
}

interface Subscription {
  id: string
  orgId: string
  moduleCode: string
  moduleName: string
  status: string
  startedAt: string
  expiresAt: string | null
  cancelledAt: string | null
  monthlyCostUsd: number
}

function StatusBadge({ status, trialEndsAt }: { status: string; trialEndsAt?: string | null }) {
  const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    ACTIVE: 'success',
    TRIAL: 'warning',
    SUSPENDED: 'destructive',
    CANCELLED: 'secondary',
  }

  let label = status
  if (status === 'TRIAL' && trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    label = `TRIAL (${daysLeft}d left)`
  }

  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {label}
    </Badge>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SubscriptionsPage() {
  const t = useTranslations('subscriptions')
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [totalCost, setTotalCost] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Subscription | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.subscription.getOrgSubscriptions.query()
      setOrg(result.organization)
      setSubscriptions(result.subscriptions)
      setTotalCost(result.totalMonthlyCostUsd)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <div className="text-muted-foreground">{t('loadingModules')}</div>
  }

  if (error) {
    return <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">Error: {error}</div>
  }

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL')

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        {/* Org Identity Card */}
        {org && (
          <div className="rounded-xl bg-card p-6 shadow-card ring-[0.65px] ring-border/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{org.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{org.billingEmail}</p>
              </div>
              <StatusBadge status={org.status} trialEndsAt={org.trialEndsAt} />
            </div>
          </div>
        )}

        {/* Subscribed Modules Table */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('modulesHeading')}</h2>
            <div className="flex items-center gap-3">
              <ExportButton exportFn={() => trpc.subscription.exportSubscriptions.query()} filters={{}} />
              <Button onClick={() => setShowAddDialog(true)}>
                {t('addModule')}
              </Button>
            </div>
          </div>

          {subscriptions.length === 0 ? (
            <div className="rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
              <EmptyState icon={CreditCard} title={t('noModules')} description={t('noModulesDescription')} />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colModule')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStartDate')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colRenewal')}</th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colCostPerMonth')}</th>
                    <th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-primary/10 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{sub.moduleName}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(sub.startedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(sub.expiresAt)}</td>
                      <td className="px-4 py-3 text-end text-muted-foreground">${sub.monthlyCostUsd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-end">
                        {(sub.status === 'ACTIVE' || sub.status === 'TRIAL') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveTarget(sub)}
                            className="text-destructive hover:text-destructive"
                          >
                            {t('removeModule')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Total monthly cost footer */}
                <tfoot className="border-t border-border bg-background">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-medium text-end text-foreground">{t('totalMonthlyCost')}</td>
                    <td className="px-4 py-3 text-end font-semibold text-foreground">${totalCost.toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Add Module Dialog */}
        <AddModuleDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onModuleAdded={fetchData}
        />

        {/* Remove Module Dialog */}
        <RemoveModuleDialog
          subscription={removeTarget ?? { id: '', moduleName: '', moduleCode: '', expiresAt: null }}
          isLastActive={activeSubscriptions.length === 1 && activeSubscriptions[0]?.id === removeTarget?.id}
          open={removeTarget !== null}
          onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}
          onModuleRemoved={fetchData}
        />

        <div className="flex gap-4">
          <a href="/subscriptions/billing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('manageBilling')}
          </a>
          <a href="/subscriptions/invoices" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('viewInvoices')}
          </a>
        </div>
      </div>
  )
}
