'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { LabNetworkCard } from '@/components/network/LabNetworkCard'
import { OutbreakActivationModal } from '@/components/network/OutbreakActivationModal'
import { OutbreakDashboard } from '@/components/network/OutbreakDashboard'
import { ChwEnrollmentModal } from '@/components/network/ChwEnrollmentModal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Network } from '@ultranos/ui-kit/icons'

type StatusFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'

interface LabSummary {
  labId: string
  labName: string
  status: string
  pendingSamples: number
  stockAlertCount: number
  stockDataAvailable: boolean
  staffCount: number
  lastSyncAt: string | null
}

interface Outbreak {
  id: string
  pathogen: string
  affectedLabIds: string[]
  affectedLabNames: string[]
  status: string
  activatedBy: string
  activatedAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  notes: string | null
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED']

export default function NetworkPage() {
  const t = useTranslations('network')
  const [labs, setLabs] = useState<LabSummary[]>([])
  const [outbreaks, setOutbreaks] = useState<Outbreak[]>([])
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOutbreakModal, setShowOutbreakModal] = useState(false)
  const [showChwModal, setShowChwModal] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [networkResult, outbreakResult] = await Promise.all([
        trpc.admin.getNetworkOverview.query(),
        trpc.admin.listOutbreaks.query(),
      ])
      setLabs(networkResult.labs)
      setOutbreaks(outbreakResult.outbreaks)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredLabs = filter === 'ALL'
    ? labs
    : labs.filter((l) => l.status === filter)

  return (
    <div className="flex flex-col gap-4">
        {/* Header + action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="destructive" size="lg" onClick={() => setShowOutbreakModal(true)}>
              {t('activateOutbreakMode')}
            </Button>
            <Button size="lg" onClick={() => setShowChwModal(true)}>
              {t('enrollChw')}
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'ALL' ? t('filterAll') : s === 'ACTIVE' ? t('filterActive') : s === 'PENDING' ? t('filterPending') : t('filterSuspended')}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="text-muted-foreground">{t('loadingNodes')}</div>
        ) : (
          <>
            {/* Lab grid */}
            {filteredLabs.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
                <EmptyState
                  icon={Network}
                  title={t('noNodes')}
                  description={t('noNodesDescription')}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLabs.map((lab) => (
                  <LabNetworkCard key={lab.labId} lab={lab} />
                ))}
              </div>
            )}

            {/* Outbreak Dashboard */}
            <div className="border-t border-border pt-6">
              <OutbreakDashboard
                outbreaks={outbreaks}
                onResolve={() => {}}
                onRefresh={fetchData}
              />
            </div>
          </>
        )}

        {/* Modals */}
        <OutbreakActivationModal
          labs={labs}
          open={showOutbreakModal}
          onOpenChange={setShowOutbreakModal}
          onSuccess={() => {
            setShowOutbreakModal(false)
            fetchData()
          }}
        />

        <ChwEnrollmentModal
          labs={labs}
          open={showChwModal}
          onOpenChange={setShowChwModal}
          onSuccess={fetchData}
        />
      </div>
  )
}
