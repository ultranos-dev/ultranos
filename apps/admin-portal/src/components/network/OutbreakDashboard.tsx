'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'

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

export function OutbreakDashboard({ outbreaks, onResolve, onRefresh }: OutbreakDashboardProps) {
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resolve outbreak')
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
          <p className="mt-2 text-sm text-muted-foreground">No active outbreaks.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {active.map((ob) => (
              <div key={ob.id} className="rounded-2xl border border-destructive/30 bg-destructive/10/30 p-4">
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
                        <button
                          onClick={() => setConfirmId(null)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleResolve(ob.id)}
                          disabled={resolving === ob.id}
                          className="rounded-full bg-success px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {resolving === ob.id ? 'Resolving...' : 'Confirm'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(ob.id)}
                        className="rounded-full bg-success px-4 py-1.5 text-xs font-semibold text-white hover:scale-[1.02] transition-transform duration-200"
                      >
                        Resolve
                      </button>
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
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <DirectionalIcon category="navigation">
              <ChevronRight className={`h-4 w-4 transition-transform ${showResolved ? 'rotate-90' : ''}`} />
            </DirectionalIcon>
            Resolved Outbreaks ({resolved.length})
          </button>

          {showResolved && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Pathogen</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Labs</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Activated</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Resolved</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
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
