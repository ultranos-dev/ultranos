'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { LabNetworkCard } from '@/components/network/LabNetworkCard'
import { OutbreakActivationModal } from '@/components/network/OutbreakActivationModal'
import { OutbreakDashboard } from '@/components/network/OutbreakDashboard'
import { ChwEnrollmentModal } from '@/components/network/ChwEnrollmentModal'
import { Button } from '@/components/ui/button'

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
      setError((err as Error)?.message ?? 'Failed to load network data')
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
    <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="destructive" size="lg" onClick={() => setShowOutbreakModal(true)}>
            Activate Outbreak Mode
          </Button>
          <Button size="lg" onClick={() => setShowChwModal(true)}>
            Enroll CHW
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading network data...</div>
        ) : (
          <>
            {/* Lab grid */}
            {filteredLabs.length === 0 ? (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground">
                  No labs found{filter !== 'ALL' ? ` with status ${filter}` : ''}.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLabs.map((lab) => (
                  <LabNetworkCard key={lab.labId} lab={lab} />
                ))}
              </div>
            )}

            {/* Outbreak Dashboard */}
            <div className="mt-8 border-t border-border pt-6">
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
