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
  /** If true, shows the full manager view (reason selector + reason text). */
  managerView?: boolean
  /** If true, this toggle is being shown on the current user's own card (self-service path). */
  isSelf?: boolean
  onChanged?: () => void
}

export function UnavailabilityToggle({
  techId,
  isCurrentlyUnavailable,
  currentReason,
  managerView = false,
  isSelf = false,
  onChanged,
}: UnavailabilityToggleProps) {
  const t = useTranslations('workload')
  const session = useAuthSessionStore((s) => s.session)
  const [saving, setSaving] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<UnavailabilityStatus>('BREAK')
  const [reason, setReason] = useState('')

  // Pass status directly to avoid reading stale React state
  async function handleMarkUnavailable(status: UnavailabilityStatus = selectedStatus) {
    setSaving(true)
    try {
      await markTechUnavailable(techId, status, reason || t(statusKey(status)))
      void reportWorkloadAuditEvent({
        action: 'TECH_AVAILABILITY_CHANGED',
        techId,
        status,
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
    // Self-service path: only the tech themselves can mark their own status via this path
    if (!isSelf) return null

    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleMarkUnavailable('BREAK')}
        className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        {saving ? t('saving') : t('markUnavailable')}
      </button>
    )
  }

  // Manager view: reason selector + free-text reason + confirm
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value as UnavailabilityStatus)}
        className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground"
        aria-label={t('selectStatus')}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {t(statusKey(s))}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('reasonPlaceholder')}
        maxLength={120}
        className="min-w-0 rounded border border-border px-1.5 py-0.5 text-xs text-foreground placeholder:text-muted-foreground"
        aria-label={t('reasonPlaceholder')}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleMarkUnavailable()}
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
