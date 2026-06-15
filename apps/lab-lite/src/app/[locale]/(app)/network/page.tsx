'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { aggregateNetworkMetrics, getLocationsWithStatus } from '@/lib/network-metrics'
import { NetworkMetricsSummary } from '@/components/network/NetworkMetricsSummary'
import { LocationCard } from '@/components/network/LocationCard'
import { LocationManagementModal } from '@/components/network/LocationManagementModal'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { MapPin } from '@ultranos/ui-kit/icons'
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
      <p className="text-lg font-semibold text-foreground">{t('accessDenied')}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t('accessDeniedDesc')}</p>
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

  // P11: Show skeleton while session is hydrating (session null = not yet loaded)
  if (!session) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  }

  if (!hasAccess) return <AccessDenied t={t} />

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('networkDashboard')}</h1>
        <button
          type="button"
          onClick={() => setModal({ open: true })}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('addLocation')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : metrics ? (
        <NetworkMetricsSummary metrics={metrics} />
      ) : null}

      {/* Location cards */}
      <section aria-label={t('locations')}>
        {/* P13: removed mb-3 — flex gap-4 handles spacing */}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('locations')}
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : locations.length === 0 ? (
          // P12: EmptyState instead of ad-hoc markup
          <EmptyState
            icon={MapPin}
            title={t('noLocations')}
            description={t('noLocationsDesc')}
            action={{ label: t('addFirstLocation'), onClick: () => setModal({ open: true }) }}
          />
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
                  onEdit={(location) => setModal({ open: true, location })}
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
