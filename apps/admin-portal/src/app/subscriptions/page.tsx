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
    return <div className="text-neutral-500">Loading subscription data...</div>
  }

  if (error) {
    return <div className="text-red-600">Error: {error}</div>
  }

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIAL')

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>

      {/* AC #1: Org Identity Card */}
      {org && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{org.name}</h2>
              <p className="text-sm text-neutral-500">{org.billingEmail}</p>
            </div>
            <StatusBadge status={org.status} trialEndsAt={org.trialEndsAt} />
          </div>
        </div>
      )}

      {/* AC #1: Subscribed Modules Table */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Modules</h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            Add Module
          </button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-neutral-500">No modules subscribed. Add your first module to get started.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Module</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Status</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Start Date</th>
                  <th className="px-4 py-3 text-start font-medium text-neutral-600">Renewal / Expiry</th>
                  <th className="px-4 py-3 text-end font-medium text-neutral-600">Cost / mo</th>
                  <th className="px-4 py-3 text-end font-medium text-neutral-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="px-4 py-3 font-medium">{sub.moduleName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(sub.startedAt)}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(sub.expiresAt)}</td>
                    <td className="px-4 py-3 text-end text-neutral-600">${sub.monthlyCostUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-end">
                      {(sub.status === 'ACTIVE' || sub.status === 'TRIAL') && (
                        <button
                          onClick={() => setRemoveTarget(sub)}
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* AC #1: Total monthly cost */}
              <tfoot className="border-t border-neutral-200 bg-neutral-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-medium text-end">Total Monthly Cost</td>
                  <td className="px-4 py-3 text-end font-semibold">${totalCost.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* AC #2: Add Module Dialog */}
      {showAddDialog && (
        <AddModuleDialog
          onClose={() => setShowAddDialog(false)}
          onModuleAdded={fetchData}
        />
      )}

      {/* AC #3: Remove Module Dialog */}
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
