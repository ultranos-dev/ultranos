'use client'

/**
 * Outbreak Mode Deactivation Modal — Story 54.5 (AC #8, Task 14)
 *
 * Confirms deactivation of Outbreak Mode. Shows what will change on deactivation.
 * Triggers final sitrep generation, then deactivates the outbreak config,
 * restores normal operations, and removes the banner.
 *
 * Role-gated: only authorized users (health_officer / lab_supervisor) can proceed.
 * RTL-safe. No PHI.
 */

import { useState, useEffect } from 'react'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  isOutbreakModeActive,
  deactivateOutbreakMode,
  restoreNormalOperations,
  isOutbreakAuthorized,
} from '@/lib/outbreak-service'
import { generateDailySitrep } from '@/lib/sitrep-generator'
import { reportOutbreakAuditEvent } from '@/lib/audit-client'
import type { LabRole } from '@ultranos/shared-types'
import type { OutbreakModeConfig } from '@/types/outbreak'

interface Props {
  onDeactivated: () => void
  onCancel: () => void
}

export function DeactivateOutbreakModal({ onDeactivated, onCancel }: Props) {
  const session = useAuthSessionStore((s) => s.session)
  const [outbreakConfig, setOutbreakConfig] = useState<OutbreakModeConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    isOutbreakModeActive()
      .then(setOutbreakConfig)
      .finally(() => setLoading(false))
  }, [])

  if (!session) return null

  const authorized = isOutbreakAuthorized({
    actorId: session.userId,
    actorRole: session.role,
    actorLabRole: session.labRole as LabRole | null,
  })

  if (!authorized) return null

  async function handleDeactivate() {
    if (!outbreakConfig || !session) return
    setSubmitting(true)
    setError(null)

    try {
      // 1. Generate final closing sitrep
      await generateDailySitrep(outbreakConfig, {
        generatedBy: session.practitionerId,
        reportDate: new Date().toISOString().split('T')[0],
      })

      // 2. Deactivate the config
      await deactivateOutbreakMode(outbreakConfig.id, {
        actorId: session.userId,
        actorRole: session.role,
        actorLabRole: session.labRole as LabRole | null,
      })

      // 3. Restore normal operations (inventory alerts, queue priorities)
      await restoreNormalOperations(outbreakConfig.targetTestCodes)

      // 4. Emit audit event
      reportOutbreakAuditEvent({
        action: 'OUTBREAK_MODE_DEACTIVATED',
        outbreakConfigId: outbreakConfig.id,
        actorId: session.practitionerId,
        actorRole: session.role,
        pathogenCode: outbreakConfig.targetPathogen.code,
        scope: outbreakConfig.affectedScope,
      })

      onDeactivated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deactivation failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '2rem', color: '#6b7280' }}>
          Loading outbreak status…
        </div>
      </div>
    )
  }

  if (!outbreakConfig) {
    return null  // No active outbreak to deactivate
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Deactivate Outbreak Mode"
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '8px', padding: '2rem',
        maxWidth: '480px', width: '90%',
        border: '2px solid #f59e0b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBlockEnd: '1rem' }}>
          <AlertTriangle size={28} color="#f59e0b" aria-hidden="true" />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#92400e' }}>
            Deactivate Outbreak Mode
          </h2>
        </div>

        <p style={{ marginBlockEnd: '1rem' }}>
          You are deactivating <strong>Outbreak Mode</strong> for{' '}
          <strong>{outbreakConfig.targetPathogen.display}</strong>.
        </p>

        <p style={{ marginBlockEnd: '0.75rem', fontWeight: 600 }}>
          The following changes will take effect immediately:
        </p>

        <ul style={{ marginBlockEnd: '1.5rem', paddingInlineStart: '1.5rem', lineHeight: 1.6 }}>
          <li>Queue priority returns to standard (no OUTBREAK PRIORITY badge)</li>
          <li>Reporting reverts to batch (real-time reporting disabled)</li>
          <li>Simplified data entry mode is disabled</li>
          <li>Inventory alerts return to normal consumption thresholds</li>
          <li>A final situation report will be auto-generated</li>
          <li>Outbreak banner is removed from all screens</li>
        </ul>

        {error && (
          <p role="alert" style={{ color: '#dc2626', marginBlockEnd: '1rem', fontSize: '0.875rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '6px',
              border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: '#fff',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={submitting}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '6px',
              backgroundColor: '#f59e0b', color: '#fff',
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {submitting ? 'Deactivating…' : 'Confirm Deactivation'}
          </button>
        </div>
      </div>
    </div>
  )
}
