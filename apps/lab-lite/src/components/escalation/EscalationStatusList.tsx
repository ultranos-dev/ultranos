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
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { acknowledgeStep, getActiveEscalations, getEscalationHistory } from '@/lib/escalation-manager'
import { reportEscalationEvent } from '@/lib/audit-client'
import type { EscalationChain, EscalationStep } from '@/lib/db'

type Tab = 'active' | 'history'

const ALLOWED_ACK_ROLES: string[] = [LabRole.LAB_MANAGER, 'physician']

function stepStatusBadge(status: EscalationStep['status']): string {
  switch (status) {
    case 'pending':    return 'bg-gray-100 text-gray-600'
    case 'sent':       return 'bg-blue-100 text-blue-700'
    case 'acknowledged': return 'bg-green-100 text-green-700'
    case 'escalated':  return 'bg-orange-100 text-orange-700'
    case 'skipped':    return 'bg-gray-100 text-gray-400'
    default:           return 'bg-gray-100 text-gray-600'
  }
}

function chainBorderClass(status: EscalationChain['status']): string {
  switch (status) {
    case 'active':       return 'border-red-400 bg-red-50'
    case 'acknowledged': return 'border-green-400 bg-green-50'
    case 'expired':      return 'border-gray-300 bg-gray-50'
    default:             return 'border-gray-200 bg-card'
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
      <td className="py-1 px-3 text-gray-500">{step.stepNumber}</td>
      <td className="py-1 px-3 text-gray-700">{t(`stepType.${step.type}`)}</td>
      <td className="py-1 px-3 text-gray-500">{formatTime(step.scheduledAt)}</td>
      <td className="py-1 px-3 text-gray-500">{formatTime(step.sentAt)}</td>
      <td className="py-1 px-3 text-gray-500">{formatTime(step.acknowledgedAt)}</td>
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

  const handleAcknowledge = async () => {
    if (!canAcknowledge || acknowledging) return
    setAcknowledging(true)
    try {
      await acknowledgeStep(chain.chainId, chain.currentStep, userId)
      reportEscalationEvent({
        action: 'ESCALATION_STEP_ACKNOWLEDGED',
        chainId: chain.chainId,
        stepNumber: chain.currentStep,
        recipientRole: 'lab_manager',
        notificationType: 'dashboard_ack',
        timestamp: new Date().toISOString(),
        resultId: chain.resultId,
      })
      onAcknowledged()
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
          <p className="font-semibold text-gray-900">
            {chain.analyte}:{' '}
            <span className="text-red-700">
              {chain.criticalValue} {chain.unit}
            </span>
            <span className="ms-2 text-xs font-normal text-gray-500 uppercase">
              {chain.criticalDirection === 'high' ? t('criticalHigh') : t('criticalLow')}
            </span>
          </p>
          <p className="text-xs text-gray-500">
            {t('patientRef')}: {chain.patientRef} · {t('elapsed')}: {elapsed} {t('minutes')}
          </p>
          <p className="text-xs text-gray-500">
            {t('step')} {chain.currentStep}/5 · {t('status')}: {t(`chainStatus.${chain.status}`)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {chain.status === 'active' && canAcknowledge && (
            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {acknowledging ? t('acknowledging') : t('acknowledge')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            aria-expanded={expanded}
          >
            {expanded ? t('collapse') : t('expand')}
          </button>
        </div>
      </div>

      {/* Step timeline */}
      {expanded && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-card">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-1.5 px-3 text-start font-medium text-gray-600">#</th>
                <th className="py-1.5 px-3 text-start font-medium text-gray-600">{t('col.type')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-gray-600">{t('col.scheduled')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-gray-600">{t('col.sent')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-gray-600">{t('col.acknowledged')}</th>
                <th className="py-1.5 px-3 text-start font-medium text-gray-600">{t('col.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
    return <p className="text-sm text-gray-500 p-4">{t('loading')}</p>
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'active', label: t('tab.active'), count: activeChains.length },
    { id: 'history', label: t('tab.history') },
  ]

  const chains = activeTab === 'active' ? activeChains : historyChains

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t('refresh')}
        </button>
      </div>

      {/* Active alert badge */}
      {activeChains.length > 0 && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
          {t('activeAlert', { count: activeChains.length })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`ms-2 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  tab.count > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chain list */}
      {chains.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          {activeTab === 'active' ? t('noActive') : t('noHistory')}
        </p>
      ) : (
        <div className="space-y-3">
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
