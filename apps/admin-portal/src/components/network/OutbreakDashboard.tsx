'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ChevronRight, Activity } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days === 0) return 'Less than a day'
  return `${days} day${days > 1 ? 's' : ''}`
}

interface OutbreakDashboardProps {
  outbreaks: Outbreak[]
  onResolve: (outbreakId: string) => void
  onRefresh: () => void
}

export function OutbreakDashboard({ outbreaks, onResolve: _onResolve, onRefresh }: OutbreakDashboardProps) {
  const [resolving, setResolving] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)

  const active = outbreaks.filter((o) => o.status === 'ACTIVE')
  const resolved = outbreaks.filter((o) => o.status === 'RESOLVED')

  async function handleResolve(outbreakId: string) {
    try {
      setResolving(outbreakId)
      setError(null)
      await trpc.admin.deactivateOutbreakMode.mutate({ outbreakId })
      setConfirmId(null)
      onRefresh()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to resolve outbreak')
    } finally {
      setResolving(null)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Outbreak Dashboard</h2>

      {error && (
        <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Active Outbreaks */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Active Outbreaks ({active.length})
        </h3>
        {active.length === 0 ? (
          <div className="mt-2">
            <EmptyState size="sm" icon={Activity} title="No active outbreaks." />
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {active.map((ob) => (
              <div key={ob.id} className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-foreground">{ob.pathogen}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ob.affectedLabNames.length} lab{ob.affectedLabNames.length > 1 ? 's' : ''} affected
                    </p>
                    <p className="text-xs text-muted-foreground mt-1" title={ob.affectedLabNames.join(', ')}>
                      Labs: {ob.affectedLabNames.join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Activated: {formatDate(ob.activatedAt)}
                    </p>
                    {ob.notes && (
                      <p className="text-xs text-muted-foreground mt-1">Notes: {ob.notes}</p>
                    )}
                  </div>
                  <div>
                    {confirmId === ob.id ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleResolve(ob.id)}
                          disabled={resolving === ob.id}
                        >
                          {resolving === ob.id ? 'Resolving...' : 'Confirm'}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => setConfirmId(ob.id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Outbreaks */}
      {resolved.length > 0 && (
        <div className="mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-2"
          >
            <DirectionalIcon category="navigation">
              <ChevronRight className={`h-4 w-4 transition-transform ${showResolved ? 'rotate-90' : ''}`} />
            </DirectionalIcon>
            Resolved Outbreaks ({resolved.length})
          </Button>

          {showResolved && (
            <div className="mt-3 overflow-x-auto rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Pathogen</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Labs</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Activated</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Resolved</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {resolved.map((ob) => (
                    <tr key={ob.id}>
                      <td className="px-4 py-3 font-medium">{ob.pathogen}</td>
                      <td className="px-4 py-3 text-muted-foreground" title={ob.affectedLabNames.join(', ')}>
                        {ob.affectedLabNames.length} lab{ob.affectedLabNames.length > 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(ob.activatedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ob.resolvedAt ? formatDate(ob.resolvedAt) : '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ob.resolvedAt ? formatDuration(ob.activatedAt, ob.resolvedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
