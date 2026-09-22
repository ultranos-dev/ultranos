'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { VerifiedPatientCache } from '@/lib/db'
import {
  generateTokenWithOverflow,
  parseOverflowIndex,
  type QueueToken,
} from '@/lib/token-generator'
import {
  addToPatientQueue,
  getActiveQueue,
  callNextPatient,
  completeQueueEntry,
  markNoShow,
  clearCompletedEntries,
  type PatientQueueEntry,
} from '@/lib/patient-queue'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Users } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { TokenBadge } from './TokenBadge'
import { TokenCard, PrintTokenButton } from './TokenCard'

export function PatientQueueManager() {
  const t = useTranslations('patientQueue')
  const [queue, setQueue] = useState<PatientQueueEntry[]>([])
  const [patients, setPatients] = useState<VerifiedPatientCache[]>([])
  const [showRegister, setShowRegister] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [printToken, setPrintToken] = useState<PatientQueueEntry | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const active = await getActiveQueue()
      setQueue(active)
    } catch {
      // Dexie unavailable
    }
  }, [])

  useEffect(() => {
    async function init() {
      await refresh()
      try {
        const db = getDb()
        const cached = await db.verified_patients.toArray()
        setPatients(cached)
      } catch {
        // no cached patients
      }
      setLoading(false)
    }
    init()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleRegister = useCallback(async () => {
    if (!selectedPatientId) return
    const patient = patients.find((p) => p.patientId === selectedPatientId)
    if (!patient) return

    const activeTokens: QueueToken[] = queue.map((e) => ({
      color: e.tokenColor,
      symbol: e.tokenSymbol,
      displayKey: e.tokenDisplayKey,
    }))

    const token = generateTokenWithOverflow(activeTokens)

    await addToPatientQueue({
      patientRef: `Patient/${patient.patientId}`,
      patientFirstName: patient.firstName,
      patientAge: patient.age,
      tokenColor: token.color,
      tokenSymbol: token.symbol,
      tokenDisplayKey: token.displayKey,
      status: 'waiting',
      registeredAt: new Date().toISOString(),
      hlcTimestamp: new Date().toISOString() + '_0000_local',
      techId: 'current-tech', // populated from session in production
    })

    setSelectedPatientId('')
    setShowRegister(false)
    await refresh()

    // Show the newly added entry for printing
    const updated = await getActiveQueue()
    const newest = updated.find((e) => e.tokenDisplayKey === token.displayKey)
    if (newest) setPrintToken(newest)
  }, [selectedPatientId, patients, queue, refresh])

  const handleCall = useCallback(
    async (id: number) => {
      await callNextPatient(id)
      await refresh()
    },
    [refresh],
  )

  const handleComplete = useCallback(
    async (id: number) => {
      await completeQueueEntry(id)
      await refresh()
    },
    [refresh],
  )

  const handleNoShow = useCallback(
    async (id: number) => {
      await markNoShow(id)
      await refresh()
    },
    [refresh],
  )

  const handleReset = useCallback(async () => {
    await clearCompletedEntries()
    // Also complete all remaining entries
    const db = getDb()
    const remaining = await db
      .table('queueEntries')
      .where('status')
      .anyOf(['waiting', 'serving'])
      .toArray()
    for (const entry of remaining) {
      if (entry.id != null) {
        await completeQueueEntry(entry.id)
      }
    }
    await clearCompletedEntries()
    await refresh()
  }, [refresh])

  const handleOpenDisplay = useCallback(() => {
    window.open('./queue/display', '_blank', 'noopener')
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const servingEntry = queue.find((e) => e.status === 'serving')
  const waitingEntries = queue.filter((e) => e.status === 'waiting')
  const waitingCount = waitingEntries.length

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('tokens.loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header actions — one toolbar row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => setShowRegister(true)}>
          {t('tokens.registerPatient')}
        </Button>
        <Button
          variant="primary"
          onClick={async () => {
            const nextWaiting = waitingEntries[0]
            if (nextWaiting?.id != null) await handleCall(nextWaiting.id)
          }}
          disabled={waitingCount === 0}
        >
          {t('tokens.callNext')}
        </Button>
        <Button variant="secondary" onClick={handleOpenDisplay}>
          {t('tokens.displayMode')}
        </Button>
        <Button variant="danger" onClick={handleReset}>
          {t('tokens.resetQueue')}
        </Button>
      </div>

      {/* Register patient modal */}
      {showRegister && (
        <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
          <h3 className="font-semibold mb-3">
            {t('tokens.registerPatient')}
          </h3>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mb-3"
          >
            <option value="">{t('tokens.selectPatient')}</option>
            {patients.map((p) => (
              <option key={p.patientId} value={p.patientId}>
                {p.firstName}, {p.age} {t('tokens.yearsOld')}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleRegister} disabled={!selectedPatientId}>
              {t('tokens.confirm')}
            </Button>
            <Button variant="secondary" onClick={() => setShowRegister(false)}>
              {t('tokens.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Print token card overlay */}
      {printToken && (
        <div className="rounded-lg border border-primary bg-primary/10 p-4">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-semibold text-primary">
              {t('tokens.tokenAssigned')}
            </h3>
            <button
              type="button"
              onClick={() => setPrintToken(null)}
              className="text-muted-foreground hover:text-muted-foreground"
              aria-label={t('tokens.cancel')}
            >
              &times;
            </button>
          </div>
          <div className="token-card-print-wrapper flex justify-center">
            <TokenCard
              color={printToken.tokenColor}
              symbol={printToken.tokenSymbol}
              overflowIndex={parseOverflowIndex(printToken.tokenDisplayKey)}
              queuePosition={
                waitingEntries.findIndex(
                  (e) => e.id === printToken.id,
                ) + 1 || queue.length
              }
            />
          </div>
          <div className="mt-3 flex justify-center">
            <PrintTokenButton onClick={handlePrint} />
          </div>
        </div>
      )}

      {/* Now serving */}
      {servingEntry && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4">
          <h3 className="text-sm font-semibold text-success mb-2">
            {t('tokens.nowServing')}
          </h3>
          <div className="flex items-center gap-3">
            <TokenBadge
              color={servingEntry.tokenColor}
              symbol={servingEntry.tokenSymbol}
              size="lg"
              overflowIndex={parseOverflowIndex(
                servingEntry.tokenDisplayKey,
              )}
            />
            <div className="text-sm text-foreground">
              <span className="font-medium">
                {servingEntry.patientFirstName}
              </span>
              , {servingEntry.patientAge}
            </div>
            <Button
              variant="primary"
              className="ms-auto"
              onClick={() => servingEntry.id != null && handleComplete(servingEntry.id)}
            >
              {t('tokens.complete')}
            </Button>
          </div>
        </div>
      )}

      {/* Waiting list */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-foreground">
          {t('tokens.waiting')} ({waitingCount})
        </h3>
        {waitingCount === 0 ? (
          <div className="flex min-h-[12rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            <EmptyState icon={Users} title={t('tokens.emptyQueue')} />
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
            {waitingEntries.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="text-sm font-mono text-muted-foreground w-6 text-end">
                  {index + 1}
                </span>
                <TokenBadge
                  color={entry.tokenColor}
                  symbol={entry.tokenSymbol}
                  size="sm"
                  overflowIndex={parseOverflowIndex(entry.tokenDisplayKey)}
                />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{entry.patientFirstName}</span>
                  <span className="text-muted-foreground">, {entry.patientAge}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatWaitTime(entry.registeredAt)}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => entry.id != null && handleCall(entry.id)}
                    className="rounded px-2 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    {t('tokens.call')}
                  </button>
                  <button
                    type="button"
                    onClick={() => entry.id != null && handleComplete(entry.id)}
                    className="rounded px-2 py-1 text-xs font-medium bg-success/10 text-success hover:bg-success/20"
                  >
                    {t('tokens.complete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => entry.id != null && handleNoShow(entry.id)}
                    className="rounded px-2 py-1 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20"
                  >
                    {t('tokens.noShow')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatWaitTime(registeredAt: string): string {
  const diffMs = Date.now() - new Date(registeredAt).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}
