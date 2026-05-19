'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { AddModuleDialog } from '@/components/subscriptions/AddModuleDialog'
import { RemoveModuleDialog } from '@/components/subscriptions/RemoveModuleDialog'

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
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    TRIAL: 'bg-amber-100 text-amber-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-neutral-100 text-neutral-600',
  }

  let label = status
  if (status === 'TRIAL' && trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    label = `TRIAL (${daysLeft}d left)`
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {label}
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SubscriptionsPage() {
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load subscription data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <div className="text-text-muted">Loading subscription data...</div>
  }

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  }

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL')

  return (
    <div className="max-w-4xl">
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">Subscriptions</h1>

      {/* Org Identity Card */}
      {org && (
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-black uppercase tracking-wide">{org.name}</h2>
              <p className="mt-1 text-sm text-text-muted">{org.billingEmail}</p>
            </div>
            <StatusBadge status={org.status} trialEndsAt={org.trialEndsAt} />
          </div>
        </div>
      )}

      {/* Subscribed Modules Table */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Modules</h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all"
          >
            Add Module
          </button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="rounded-3xl border border-border bg-white p-8 text-center">
            <p className="text-text-muted">No modules subscribed. Add your first module to get started.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Module</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Start Date</th>
                  <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wider">Renewal / Expiry</th>
                  <th className="px-4 py-3 text-end font-medium text-white text-xs uppercase tracking-wider">Cost / mo</th>
                  <th className="px-4 py-3 text-end font-medium text-white text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-brand-lime/5 transition-colors">
                    <td className="px-4 py-3 font-medium text-black">{sub.moduleName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(sub.startedAt)}</td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(sub.expiresAt)}</td>
                    <td className="px-4 py-3 text-end text-text-muted">${sub.monthlyCostUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-end">
                      {(sub.status === 'ACTIVE' || sub.status === 'TRIAL') && (
                        <button
                          onClick={() => setRemoveTarget(sub)}
                          className="rounded-full text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Total monthly cost footer */}
              <tfoot className="border-t border-border bg-white">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-medium text-end text-black">Total Monthly Cost</td>
                  <td className="px-4 py-3 text-end font-semibold text-black">${totalCost.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add Module Dialog */}
      {showAddDialog && (
        <AddModuleDialog
          onClose={() => setShowAddDialog(false)}
          onModuleAdded={fetchData}
        />
      )}

      {/* Remove Module Dialog */}
      {removeTarget && (
        <RemoveModuleDialog
          subscription={removeTarget}
          isLastActive={activeSubscriptions.length === 1 && activeSubscriptions[0]?.id === removeTarget.id}
          onClose={() => setRemoveTarget(null)}
          onModuleRemoved={fetchData}
        />
      )}
    </div>
  )
}
