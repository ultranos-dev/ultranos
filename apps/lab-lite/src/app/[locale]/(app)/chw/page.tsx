'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — CHW Home Screen
// Ultra-simplified 3-action dashboard for community health workers.
// Three large action buttons (48x48px min touch target), no lab features.
// Font size minimum 18px for field readability (CLAUDE.md WCAG touch targets).
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  FlaskConical,
  Truck,
  ClipboardList,
  Wifi,
  WifiOff,
  CheckCircle,
  AlertCircle,
} from '@ultranos/ui-kit/icons'
import { getTodayCHWSamples, getPendingSyncItems } from '@/lib/db'
import { useIsCHWMode } from '@/lib/chw-mode'

export default function CHWPage() {
  const t = useTranslations('chw')
  const locale = useLocale()
  const router = useRouter()
  const isChw = useIsCHWMode()

  const [todayCount, setTodayCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  // Refresh counts when page mounts or comes back into focus
  useEffect(() => {
    async function refreshCounts() {
      const [today, pending] = await Promise.all([
        getTodayCHWSamples(),
        getPendingSyncItems(),
      ])
      setTodayCount(today.length)
      setPendingCount(pending.length)
    }
    void refreshCounts()

    const handleFocus = () => void refreshCounts()
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Redirect non-CHW users to main lab portal
  if (!isChw) {
    router.replace(`/${locale}`)
    return null
  }

  const syncLabel =
    !isOnline
      ? t('syncOffline', { count: pendingCount })
      : pendingCount === 0
        ? t('syncAllSynced')
        : t('syncPending', { count: pendingCount })

  const syncColor =
    !isOnline ? 'text-red-600' : pendingCount === 0 ? 'text-green-600' : 'text-amber-600'
  const SyncIcon = !isOnline ? WifiOff : pendingCount === 0 ? CheckCircle : AlertCircle

  return (
    <div className="flex min-h-screen flex-col bg-card px-4 py-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      {/* Three main action buttons */}
      <div className="flex flex-1 flex-col gap-4">
        <ActionButton
          icon={<FlaskConical size={48} aria-hidden />}
          label={t('collectSample')}
          onClick={() => router.push(`/${locale}/chw/collect`)}
          color="bg-primary hover:bg-primary/90"
        />
        <ActionButton
          icon={<Truck size={48} aria-hidden />}
          label={t('courierPickup')}
          onClick={() => router.push(`/${locale}/chw/handoff`)}
          color="bg-purple-600 hover:bg-purple-700"
        />
        <ActionButton
          icon={<ClipboardList size={48} aria-hidden />}
          label={t('todaysLog')}
          onClick={() => router.push(`/${locale}/chw/log`)}
          color="bg-gray-700 hover:bg-gray-800"
        />
      </div>

      {/* Bottom status bar */}
      <div className="mt-8 flex items-center justify-between rounded-xl bg-muted px-4 py-3">
        <span className="text-lg font-semibold text-foreground">
          {t('samplesCount', { count: todayCount })}
        </span>
        <span className={`flex items-center gap-1.5 text-sm font-medium ${syncColor}`}>
          <SyncIcon size={16} aria-hidden />
          {syncLabel}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActionButton — large touch-friendly card button (WCAG min 48x48px)
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  color: string
}

function ActionButton({ icon, label, onClick, color }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex min-h-[96px] w-full flex-col items-center justify-center gap-3
        rounded-2xl px-4 py-5 text-white shadow-md transition-transform
        active:scale-95 focus-visible:outline focus-visible:outline-2
        focus-visible:outline-offset-2 focus-visible:outline-ring
        ${color}
      `}
      aria-label={label}
    >
      {icon}
      <span className="text-xl font-semibold leading-tight">{label}</span>
    </button>
  )
}
