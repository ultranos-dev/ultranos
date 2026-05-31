'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { markTechUnavailable, markTechAvailable } from '@/lib/workload-service'
import { reportWorkloadAuditEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type UnavailabilityStatus = 'BREAK' | 'ABSENT' | 'TRAINING'

const STATUS_OPTIONS: UnavailabilityStatus[] = ['BREAK', 'ABSENT', 'TRAINING']

interface UnavailabilityToggleProps {
  techId: string
  isCurrentlyUnavailable: boolean
  currentReason: string | null
  /** If true, shows the full manager view (reason selector dropdown). */
  managerView?: boolean
  onChanged?: () => void
}

export function UnavailabilityToggle({
  techId,
  isCurrentlyUnavailable,
  currentReason,
  managerView = false,
  onChanged,
}: UnavailabilityToggleProps) {
  const t = useTranslations('workload')
  const session = useAuthSessionStore((s) => s.session)
  const [saving, setSaving] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<UnavailabilityStatus>('BREAK')
  const [reason, setReason] = useState('')

  async function handleMarkUnavailable() {
    setSaving(true)
    try {
      await markTechUnavailable(techId, selectedStatus, reason || t(statusKey(selectedStatus)))
      void reportWorkloadAuditEvent({
        action: 'TECH_AVAILABILITY_CHANGED',
        techId,
        status: selectedStatus,
        changedBy: session?.userId ?? 'unknown',
      })
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkAvailable() {
    setSaving(true)
    try {
      await markTechAvailable(techId)
      void reportWorkloadAuditEvent({
        action: 'TECH_AVAILABILITY_CHANGED',
        techId,
        status: 'AVAILABLE',
        changedBy: session?.userId ?? 'unknown',
      })
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  if (isCurrentlyUnavailable) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-700">
          {currentReason ?? t('unavailable')}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={handleMarkAvailable}
          className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? t('saving') : t('markAvailable')}
        </button>
      </div>
    )
  }

  if (!managerView) {
    // Self-service: simple toggle, no reason selector
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setSelectedStatus('BREAK')
          void handleMarkUnavailable()
        }}
        className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        {saving ? t('saving') : t('markUnavailable')}
      </button>
    )
  }

  // Manager view: reason selector + confirm
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value as UnavailabilityStatus)}
        className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-700"
        aria-label={t('markUnavailable')}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {t(statusKey(s))}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={saving}
        onClick={handleMarkUnavailable}
        className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        {saving ? t('saving') : t('markUnavailable')}
      </button>
    </div>
  )
}

function statusKey(status: UnavailabilityStatus): 'statusBreak' | 'statusAbsent' | 'statusTraining' {
  switch (status) {
    case 'BREAK':    return 'statusBreak'
    case 'ABSENT':   return 'statusAbsent'
    case 'TRAINING': return 'statusTraining'
  }
}
