'use client'

/**
 * Outbreak Mode Banner — Story 54.5 (AC #10)
 *
 * Persistent banner displayed at the top of every screen while Outbreak Mode is active.
 * Content: "[OUTBREAK MODE ACTIVE: {pathogen}] — Activated by {officer} on {date}"
 *
 * NOT dismissible — persists until outbreak mode is deactivated (AC #10 explicit).
 * Role-gated "Deactivate" button (AC #6.4 / AC #2).
 *
 * RTL-safe: uses logical CSS properties.
 * No PHI: officer identity is practitioner ID only.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { isOutbreakModeActive, isOutbreakAuthorized } from '@/lib/outbreak-service'
import type { LabRole } from '@ultranos/shared-types'
import type { OutbreakModeConfig } from '@/types/outbreak'

interface Props {
  /** Called when authorized user clicks "Deactivate" */
  onDeactivate: () => void
}

export function OutbreakModeBanner({ onDeactivate }: Props) {
  const t = useTranslations('outbreak')
  const session = useAuthSessionStore((s) => s.session)
  const [activeOutbreak, setActiveOutbreak] = useState<OutbreakModeConfig | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkOutbreakStatus() {
      try {
        const config = await isOutbreakModeActive()
        if (!cancelled) {
          setActiveOutbreak(config)
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    }

    checkOutbreakStatus()

    // Recheck every 30 seconds in case another device activated/deactivated
    const interval = setInterval(checkOutbreakStatus, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (!loaded || !activeOutbreak) return null

  const canDeactivate = session
    ? isOutbreakAuthorized({
        actorId: session.userId,
        actorRole: session.role,
        actorLabRole: session.labRole as LabRole | null,
      })
    : false

  const activatedDate = new Date(activeOutbreak._ultranos.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="outbreak-mode-banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9000,
        backgroundColor: '#dc2626',  // red-600
        color: '#ffffff',
        padding: '0.625rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        boxShadow: '0 2px 8px rgba(220,38,38,0.4)',
        minHeight: '48px',
      }}
    >
      {/* Banner message */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, flexWrap: 'wrap' }}>
        <AlertTriangle size={20} aria-hidden="true" strokeWidth={2.5} />
        <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
          {t('bannerActive', { pathogen: activeOutbreak.targetPathogen.display.toUpperCase() })}
        </span>
        <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>
          {t('bannerActivatedBy', { officer: activeOutbreak.activatedBy, date: activatedDate })}
        </span>
      </div>

      {/* Deactivate button — role-gated, never dismissible for others */}
      {canDeactivate && (
        <button
          type="button"
          onClick={onDeactivate}
          aria-label={t('bannerDeactivateAriaLabel')}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: '4px',
            padding: '0.3125rem 0.875rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          className="hover:bg-card/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {t('bannerDeactivateButton')}
        </button>
      )}
    </div>
  )
}
