'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { aggregateNetworkMetrics, getLocationsWithStatus } from '@/lib/network-metrics'
import { NetworkMetricsSummary } from '@/components/network/NetworkMetricsSummary'
import { LocationCard } from '@/components/network/LocationCard'
import { LocationManagementModal } from '@/components/network/LocationManagementModal'
import type { NetworkMetrics, LabLocation, NetworkStatusSnapshot } from '@/types/lab-network'
import { LabRole } from '@ultranos/shared-types'

interface LocationWithSnapshot {
  locationId: string
  name: string
  type: string
  mode: string
  status: string
  snapshot: NetworkStatusSnapshot
}

type ModalState = { open: false } | { open: true; location?: LabLocation }

function AccessDenied({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="alert">
      <p className="text-lg font-semibold text-neutral-700">{t('accessDenied')}</p>
      <p className="mt-2 text-sm text-neutral-500">{t('accessDeniedDesc')}</p>
    </div>
  )
}

export default function NetworkDashboardPage() {
  const t = useTranslations('network')
  const session = useAuthSessionStore((s) => s.session)

  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null)
  const [locations, setLocations] = useState<LocationWithSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ open: false })

  // Role guard — only LAB_MANAGER and SUPERVISOR may access
  const allowedRoles: (LabRole | null)[] = [LabRole.LAB_MANAGER, LabRole.SUPERVISOR]
  const hasAccess = session?.labRole != null && allowedRoles.includes(session.labRole)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, locs] = await Promise.all([
        aggregateNetworkMetrics(),
        getLocationsWithStatus(),
      ])
      setMetrics(m)
      setLocations(locs)
    } catch {
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (hasAccess) {
      void loadData()
    }
  }, [hasAccess, loadData])

  if (!session) return null
  if (!hasAccess) return <AccessDenied t={t} />

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{t('networkDashboard')}</h1>
        <button
          type="button"
          onClick={() => setModal({ open: true })}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {t('addLocation')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
          {error}
          <button type="button" onClick={() => void loadData()} className="ms-2 underline">
            {t('retry')}
          </button>
        </div>
      )}

      {/* Network metrics summary */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-neutral-200 bg-white" />
          ))}
        </div>
      ) : metrics ? (
        <NetworkMetricsSummary metrics={metrics} />
      ) : null}

      {/* Location cards */}
      <section aria-label={t('locations')}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {t('locations')}
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border border-neutral-200 bg-white" />
            ))}
          </div>
        ) : locations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 py-12 text-center">
            <p className="text-sm text-neutral-500">{t('noLocations')}</p>
            <button
              type="button"
              onClick={() => setModal({ open: true })}
              className="mt-3 text-sm text-blue-600 underline"
            >
              {t('addFirstLocation')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((loc) => {
              const labLocation: LabLocation = {
                id: loc.locationId,
                name: loc.name,
                type: loc.type as LabLocation['type'],
                mode: loc.mode as LabLocation['mode'],
                status: loc.status as LabLocation['status'],
                settings: {},
                meta: { lastUpdated: '', versionId: '1' },
                _ultranos: { createdAt: '', hlcTimestamp: '' },
              }
              return (
                <LocationCard
                  key={loc.locationId}
                  location={labLocation}
                  snapshot={loc.snapshot}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Location management modal */}
      {modal.open && (
        <LocationManagementModal
          editLocation={modal.location}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false })
            void loadData()
          }}
        />
      )}
    </div>
  )
}
