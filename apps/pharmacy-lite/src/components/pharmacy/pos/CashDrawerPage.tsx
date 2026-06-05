'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { usePosStore } from '@/stores/pos-store'
import {
  getOpenCashDrawer,
  openCashDrawer,
  closeCashDrawer,
  getRecentDrawers,
} from '@/lib/pos/cash-drawer-service'
import type { CashDrawer } from '@/lib/pos/types'

const CURRENCY = 'AFN'
const MINOR_UNITS = 2

function fmt(amount: number): string {
  const divisor = Math.pow(10, MINOR_UNITS)
  return `${CURRENCY} ${(amount / divisor).toFixed(MINOR_UNITS)}`
}

function parseMinor(value: string): number {
  const divisor = Math.pow(10, MINOR_UNITS)
  const parsed = parseFloat(value)
  if (isNaN(parsed)) return 0
  return Math.round(parsed * divisor)
}

export function CashDrawerPage() {
  const session = useAuthSessionStore((s) => s.session)
  const { activeCashDrawer, setActiveCashDrawer } = usePosStore()
  const [recentDrawers, setRecentDrawers] = useState<CashDrawer[]>([])
  const [openingStr, setOpeningStr] = useState('')
  const [closingStr, setClosingStr] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const drawer = await getOpenCashDrawer()
    setActiveCashDrawer(drawer)
    const recent = await getRecentDrawers(10)
    setRecentDrawers(recent)
  }, [setActiveCashDrawer])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!session) return

    const openingBalance = parseMinor(openingStr)
    setSubmitting(true)
    try {
      const drawer = await openCashDrawer({
        openedBy: `Practitioner/${session.practitionerId}`,
        openingBalance,
      })
      setActiveCashDrawer(drawer)
      setOpeningStr('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open drawer.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!activeCashDrawer) return

    const closingBalance = parseMinor(closingStr)
    setSubmitting(true)
    try {
      await closeCashDrawer({
        drawerId: activeCashDrawer.id,
        closingBalance,
        notes: closeNotes || undefined,
      })
      setActiveCashDrawer(null)
      setClosingStr('')
      setCloseNotes('')
      const recent = await getRecentDrawers(10)
      setRecentDrawers(recent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close drawer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Cash Drawer</h1>

      {/* Active drawer or open form */}
      {activeCashDrawer ? (
        <div className="rounded-lg border-2 border-success bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-success">Drawer Open</h2>
            <span className="text-xs text-muted-foreground">
              Since {new Date(activeCashDrawer.openedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Opening Balance</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {fmt(activeCashDrawer.openingBalance)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash In</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {fmt(activeCashDrawer.cashIn)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expected Balance</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {fmt(activeCashDrawer.openingBalance + activeCashDrawer.cashIn - activeCashDrawer.cashOut)}
              </p>
            </div>
          </div>

          {/* Close form */}
          <form onSubmit={handleClose} className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1">
              <label htmlFor="closing-balance" className="text-sm font-medium text-foreground">
                Closing Balance (counted)
              </label>
              <input
                id="closing-balance"
                type="number"
                step="any"
                min="0"
                value={closingStr}
                onChange={(e) => setClosingStr(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="close-notes" className="text-sm font-medium text-foreground">
                Notes (optional)
              </label>
              <input
                id="close-notes"
                type="text"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="default" className="w-full" disabled={submitting}>
              {submitting ? 'Closing...' : 'Close Drawer'}
            </Button>
          </form>
        </div>
      ) : (
        <form onSubmit={handleOpen} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Open Cash Drawer</h2>
          <div className="space-y-1">
            <label htmlFor="opening-balance" className="text-sm font-medium text-foreground">
              Opening Balance
            </label>
            <input
              id="opening-balance"
              type="number"
              step="any"
              min="0"
              value={openingStr}
              onChange={(e) => setOpeningStr(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              placeholder="0.00"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="default" className="w-full" disabled={submitting}>
            {submitting ? 'Opening...' : 'Open Drawer'}
          </Button>
        </form>
      )}

      {/* Recent closed sessions */}
      {recentDrawers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recent Sessions</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {recentDrawers.map((d) => {
              const disc = d.discrepancy ?? 0
              return (
                <li key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-foreground">
                      {new Date(d.openedAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(d.openedAt).toLocaleTimeString()} - {d.closedAt ? new Date(d.closedAt).toLocaleTimeString() : '—'}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm tabular-nums text-foreground">
                      {fmt(d.closingBalance ?? 0)}
                    </p>
                    <p className={`text-xs tabular-nums font-medium ${disc >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {disc >= 0 ? '+' : ''}{fmt(disc)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
