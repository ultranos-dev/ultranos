'use client'

/**
 * Story 52.2 — Shared Inventory Visibility: Network Inventory Page
 *
 * Tabs:
 *   "Network View" — NetworkInventoryHeatMap (all labs, heat map matrix)
 *   "My Lab"       — LabInventoryDetail (single-lab detailed view + network comparison)
 *   "Transfers"    — RedistributionPanel (actionable redistribution recommendations)
 *
 * Offline: all three views render from Dexie cache when Hub is unreachable.
 *
 * Audit (CLAUDE.md Rule #6): emits an audit event on page load for every
 * access to aggregate network inventory data.
 */

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AuthGuard } from '@/components/AuthGuard'
import { NetworkInventoryHeatMap } from '@/components/inventory/NetworkInventoryHeatMap'
import { LabInventoryDetail } from '@/components/inventory/LabInventoryDetail'
import { RedistributionPanel } from '@/components/inventory/RedistributionPanel'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { reportInventoryAuditEvent } from '@/lib/audit-client'
import { LabRole } from '@ultranos/shared-types'

type Tab = 'network' | 'mylab' | 'transfers'

function NetworkInventoryContent() {
  const t = useTranslations('inventory')
  const { session } = useAuthSessionStore()
  const [activeTab, setActiveTab] = useState<Tab>('network')

  const myLabId = session?.labId ?? 'unset'
  const myLabName = session?.labName ?? t('myLab')
  const isNetworkAdmin =
    session?.labRole === LabRole.SUPERVISOR ||
    session?.labRole === LabRole.LAB_MANAGER

  // Audit: log every network inventory page access (CLAUDE.md Rule #6)
  useEffect(() => {
    if (!session?.userId) return
    reportInventoryAuditEvent({
      action: 'NETWORK_INVENTORY_VIEWED',
      labId: myLabId,
      actorId: session.userId,
    })
  }, [session, myLabId])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'network', label: t('networkView') },
    { id: 'mylab', label: t('myLabView') },
    { id: 'transfers', label: t('transferRecommendations') },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t('networkInventoryTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('networkInventorySubtitle')}</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label={t('inventoryTabs')}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'network' && (
          <NetworkInventoryHeatMap myLabId={myLabId} />
        )}
        {activeTab === 'mylab' && (
          <LabInventoryDetail labId={myLabId} labName={myLabName} />
        )}
        {activeTab === 'transfers' && (
          <RedistributionPanel myLabId={myLabId} isNetworkAdmin={isNetworkAdmin} />
        )}
      </div>
    </div>
  )
}

export default function NetworkInventoryPage() {
  return (
    <AuthGuard>
      <NetworkInventoryContent />
    </AuthGuard>
  )
}
