'use client'

/**
 * EscalationStatusList — Story 48.4 (AC: 7)
 *
 * Dashboard showing active and historical escalation chains.
 * Active tab: chains that need attention (red border).
 * History tab: completed/acknowledged chains for audit review.
 *
 * Expandable rows show full step timeline: type, scheduled, sent, acknowledged, status.
 * Color coding: active = red, acknowledged = green, expired = gray.
 * Acknowledge action: any LAB_MANAGER or physician can acknowledge from this view.
 *
 * PHI: patient ref is opaque (never shown as name). Analyte + critical value ARE clinical
 * information but not patient-identifying — shown per clinical workflow requirements.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { CircleCheck, FileSearch } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { acknowledgeStep, getActiveEscalations, getEscalationHistory } from '@/lib/escalation-manager'
import { reportEscalationEvent } from '@/lib/audit-client'
import type { EscalationChain, EscalationStep } from '@/lib/db'

type Tab = 'active' | 'history'

const ALLOWED_ACK_ROLES: string[] = [LabRole.LAB_MANAGER, 'physician']

function stepStatusBadge(status: EscalationStep['status']): string {
  switch (status) {
    case 'pending':    return 'bg-muted text-muted-foreground'
    case 'sent':       return 'bg-primary/10 text-primary'
    case 'acknowledged': return 'bg-success/10 text-success'
    case 'escalated':  return 'bg-warning/10 text-warning'
    case 'skipped':    return 'bg-muted text-muted-foreground'
    default:           return 'bg-muted text-muted-foreground'
  }
}

function chainBorderClass(status: EscalationChain['status']): string {
  switch (status) {
    // Active critical chains keep red prominence (CLAUDE.md Rule #4) via the destructive token.
    case 'active':       return 'border-destructive/40 bg-destructive/10'
    case 'acknowledged': return 'border-success/40 bg-success/10'
    case 'expired':      return 'border-border bg-muted'
    default:             return 'border-border bg-card'
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function elapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
}

interface StepRowProps {
  step: EscalationStep
  t: ReturnType<typeof useTranslations>
}

function StepRow({ step, t }: StepRowProps) {
  return (
    <tr className="text-xs">
      <td className="py-1 px-3 text-muted-foreground">{step.stepNumber}</td>
      <td className="py-1 px-3 text-foreground">{t(`stepType.${step.type}`)}</td>
      <td className="py-1 px-3 text-muted-foreground">{formatTime(step.scheduledAt)}</td>
      <td className="py-1 px-3 text-muted-foreground">{formatTime(step.sentAt)}</td>
      <td className="py-1 px-3 text-muted-foreground">{formatTime(step.acknowledgedAt)}</td>
      <td className="py-1 px-3">
        <span className={`rounded-full px-2 py-0.5 font-medium ${stepStatusBadge(step.status)}`}>
          {t(`stepStatus.${step.status}`)}
        </span>
      </td>
    </tr>
  )
}

interface ChainCardProps {
  chain: EscalationChain
  canAcknowledge: boolean
  userId: string
  onAcknowledged: () => void
  t: ReturnType<typeof useTranslations>
}

function ChainCard({ chain, canAcknowledge, userId, onAcknowledged, t }: ChainCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)

  const handleAcknowledge = async () => {
    if (!canAcknowledge || acknowledging) return
    setAckError(null)
    setAcknowledging(true)
    try {
      const lastSentStep = chain.steps
        .filter((s) => s.status === 'sent' || s.status === 'acknowledged')
        .sort((a, b) => b.stepNumber - a.stepNumber)[0]
      const stepToAck = lastSentStep?.stepNumber ?? chain.currentStep
      await acknowledgeStep(chain.chainId, stepToAck, userId)
      reportEscalationEvent({
        action: 'ESCALATION_STEP_ACKNOWLEDGED',
        chainId: chain.chainId,
        stepNumber: stepToAck,
        recipientRole: 'lab_manager',
        notificationType: 'dashboard_ack',
        timestamp: new Date().toISOString(),
        resultId: chain.resultId,
      })
      onAcknowledged()
    } catch {
      setAckError('Acknowledgment failed — please try again or contact support.')
    } finally {
      setAcknowledging(false)
    }
  }

  const elapsed = elapsedMinutes(chain.createdAt)

  return (
    <div className={`rounded-lg border-2 p-4 space-y-3 ${chainBorderClass(chain.status)}`}>
      {/* Chain header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            {chain.analyte}:{' '}
            <span className="font-semibold text-destructive">
              {chain.criticalValue} {chain.unit}
            </span>
            <span className="ms-2 text-xs font-normal text-muted-foreground uppercase">
              {chain.criticalDirection === 'high' ? t('criticalHigh') : t('criticalLow')}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t('patientRef')}: {chain.patientRef} · {t('elapsed')}: {elapsed} {t('minutes')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('step')} {chain.currentStep}/5 · {t('status')}: {t(`chainStatus.${chain.status}`)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {chain.status === 'active' && canAcknowledge && (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="rounded-lg bg-success px-3 py-1.5 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50"
              >
                {acknowledging ? t('acknowledging') : t('acknowledgeButton')}
              </button>
              {ackError && (
                <p role="alert" className="text-sm text-destructive mt-1">{ackError}</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            aria-expanded={expanded}
          >
            {expanded ? t('collapse') : t('expand')}
          </button>
        </div>
      </div>

      {/* Step timeline */}
      {expanded && (
        <div className="overflow-x-auto rounded border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="py-1.5 px-3 text-start font-medium text-muted-foreground">#</th>
                <th className="py-1.5 px-3 text-start font-medium text-muted-foreground">{t('col.type')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-muted-foreground">{t('col.scheduled')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-muted-foreground">{t('col.sent')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-muted-foreground">{t('col.acknowledged')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-muted-foreground">{t('col.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chain.steps.map((step) => (
                <StepRow key={step.stepNumber} step={step} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function EscalationStatusList() {
  const t = useTranslations('escalation.status')
  const session = useAuthSessionStore((s) => s.session)
  const canAcknowledge = session?.labRole ? ALLOWED_ACK_ROLES.includes(session.labRole) : false
  const userId = session?.userId ?? 'unknown'

  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [activeChains, setActiveChains] = useState<EscalationChain[]>([])
  const [historyChains, setHistoryChains] = useState<EscalationChain[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const [active, history] = await Promise.all([
        getActiveEscalations(),
        getEscalationHistory(),
      ])
      // Sort active chains: most recent first
      setActiveChains(active.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setHistoryChains(history.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // Refresh active chains every 60 seconds
    const interval = setInterval(() => void load(), 60_000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">{t('loading')}</p>
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'active', label: t('activeTab'), count: activeChains.length },
    { id: 'history', label: t('historyTab') },
  ]

  const query = search.trim().toLowerCase()
  const allChains = activeTab === 'active' ? activeChains : historyChains
  const chains = query
    ? allChains.filter((c) =>
        [c.analyte, c.patientRef, c.criticalValue, c.unit]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    : allChains
  const filtersActive = query !== ''

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: pill tabs + wide search + refresh — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ms-2 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  activeTab === tab.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive/10 text-destructive'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t('refresh')}
        </Button>
      </div>

      {/* Active alert badge — critical prominence via destructive token */}
      {activeChains.length > 0 && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {t('activeAlert', { count: activeChains.length })}
        </div>
      )}

      {/* Chain list — cards */}
      {chains.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <EmptyState
            icon={filtersActive ? FileSearch : CircleCheck}
            title={filtersActive ? t('noResults') : activeTab === 'active' ? t('noActiveEscalations') : t('noHistory')}
            action={filtersActive ? { label: t('clearSearch'), onClick: () => setSearch('') } : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {chains.map((chain) => (
            <ChainCard
              key={chain.chainId}
              chain={chain}
              canAcknowledge={canAcknowledge}
              userId={userId}
              onAcknowledged={() => void load()}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}
