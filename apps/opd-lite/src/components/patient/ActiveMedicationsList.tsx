'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { formatDate } from '@ultranos/ui-kit'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { db } from '@/lib/db'
import { fetchActiveMedicationsFromHub } from '@/lib/trpc'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { Card } from '@/components/Card'
import type { LocalMedicationStatement } from '@/lib/db'

interface ActiveMedicationsListProps {
  patientId: string
}

interface MedicationRow {
  id: string
  drugName: string
  startDate: string
  hasOverride: boolean
}

/** Format ISO datetime to locale date string. Returns empty string if no date. */
function formatStartDate(iso: string | undefined, locale: 'en' | 'ar' | 'prs' | 'ps'): string {
  if (!iso) return ''
  try {
    return formatDate(iso, locale)
  } catch {
    return iso
  }
}

async function buildRows(
  statements: LocalMedicationStatement[],
  patientId: string,
  locale: 'en' | 'ar' | 'prs' | 'ps',
): Promise<MedicationRow[]> {
  // Load interaction audit entries for override detection
  let overrideIds = new Set<string>()
  try {
    const auditEntries = await db.interactionAuditLog
      .where('patientId')
      .equals(patientId)
      .toArray()
    overrideIds = new Set(
      auditEntries
        .filter((e) => e.overrideReason)
        .map((e) => e.medicationRequestId),
    )
  } catch {
    // Override data unavailable — proceed without it (display only suffers, safety is not affected)
  }

  return statements.map((stmt) => {
    const coding = stmt.medicationCodeableConcept?.coding?.[0]
    const drugName =
      coding?.display ?? stmt.medicationCodeableConcept?.text ?? ''

    const startDate = formatStartDate(stmt.effectivePeriod?.start, locale)

    const hasOverride = stmt._ultranos.sourcePrescriptionId
      ? overrideIds.has(stmt._ultranos.sourcePrescriptionId)
      : false

    return { id: stmt.id, drugName, startDate, hasOverride }
  })
}

/**
 * Read-only list of active medications for a patient.
 *
 * Load strategy (mirrors allergy-store):
 *   1. Local-first: render Dexie cache immediately (offline-safe).
 *   2. Hub reconcile: fetch Hub's authoritative list; cache result to Dexie.
 *   3. Hub unreachable → keep local cache.
 *
 * Error safety:
 *   - Dexie read error → "unavailable" warning (never a false "no meds").
 *   - Hub unreachable + empty local cache → "not synced to this device" warning.
 *   - Only Hub confirms an empty list → true "No active medications" EmptyState.
 */
export function ActiveMedicationsList({
  patientId,
}: ActiveMedicationsListProps) {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('patient')
  const [meds, setMeds] = useState<MedicationRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // 'error' = Dexie/network failure; 'unsynced' = empty local + Hub offline; null = healthy
  const [loadError, setLoadError] = useState<'error' | 'unsynced' | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadMedications() {
      // --- Step 1: Local-first ---
      let localStatements: LocalMedicationStatement[] = []
      let localReadOk = false
      try {
        const patientRef = `Patient/${patientId}`
        const statements = await db.medicationStatements
          .where('subject.reference')
          .equals(patientRef)
          .toArray()
        localStatements = statements.filter((s) => s.status === 'active')
        localReadOk = true
      } catch {
        // Local read failed — show error (not empty) until Hub reconcile finishes.
      }

      if (!cancelled) {
        if (localReadOk) {
          setMeds(await buildRows(localStatements, patientId, locale))
          setLoadError(null)
        } else {
          setLoadError('error')
        }
      }

      // --- Step 2: Hub reconcile ---
      let hubStatements: Array<Record<string, unknown>> | null = null
      try {
        hubStatements = await fetchActiveMedicationsFromHub(patientId)
      } catch {
        hubStatements = null
      }

      if (cancelled) return

      if (hubStatements !== null) {
        // Hub returned authoritatively (even if empty — that is a real "no meds").
        const fhirStatements = hubStatements as unknown as LocalMedicationStatement[]
        const activeHub = fhirStatements.filter((s) => s.status === 'active')

        // Cache to Dexie (best-effort; failures do not block the UI).
        try {
          await db.medicationStatements.bulkPut(activeHub)
        } catch {
          /* caching is best-effort */
        }

        try {
          auditPhiAccess(
            AuditAction.READ,
            AuditResourceType.MEDICATION_STATEMENT,
            `patient-active-meds:${patientId}`,
            patientId,
            { phiAccess: 'active_medications_view', count: activeHub.length, source: 'hub' },
          )
        } catch { /* auditPhiAccess is documented non-throwing */ }

        if (!cancelled) {
          setMeds(await buildRows(activeHub, patientId, locale))
          setLoadError(null)
          setIsLoading(false)
        }
        return
      }

      // --- Step 3: Hub unreachable — keep local cache ---
      try {
        auditPhiAccess(
          AuditAction.READ,
          AuditResourceType.MEDICATION_STATEMENT,
          `patient-active-meds:${patientId}`,
          patientId,
          { phiAccess: 'active_medications_view', count: localStatements.length, source: 'local' },
        )
      } catch { /* auditPhiAccess is documented non-throwing */ }

      if (!cancelled) {
        if (!localReadOk) {
          // Neither local nor Hub — show unavailable error.
          setLoadError('error')
        } else if (localStatements.length === 0) {
          // Local cache is empty AND Hub is offline — can't confidently assert "no meds";
          // the device may not be fully synced. Show "not synced" warning instead.
          setLoadError('unsynced')
        } else {
          // Local cache has records and Hub is offline — show what we have.
          setLoadError(null)
        }
        setIsLoading(false)
      }
    }

    loadMedications().finally(() => {
      if (!cancelled) setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [patientId, locale])

  if (isLoading) {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('activeMedications')}
        </h3>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>
    )
  }

  // Load error — cannot determine medication status. Never show "No active medications".
  if (loadError === 'error') {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('activeMedications')}
        </h3>
        <div
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
          aria-live="assertive"
          data-testid="medications-unavailable"
        >
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
          <span>{t('medicationsLoadError')}</span>
        </div>
      </Card>
    )
  }

  // Unsynced — local cache empty but Hub was unreachable; data may exist on Hub.
  if (loadError === 'unsynced') {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('activeMedications')}
        </h3>
        <div
          className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-foreground"
          role="alert"
          aria-live="polite"
          data-testid="medications-unsynced"
        >
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-warning" />
          <span>{t('medicationsUnavailable')}</span>
        </div>
      </Card>
    )
  }

  // Hub-confirmed empty list (Hub returned [] for this patient).
  if (meds.length === 0) {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('activeMedications')}
        </h3>
        <EmptyState size="sm" title={t('noActiveMedications')} data-testid="medications-empty" />
      </Card>
    )
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {t('activeMedications')}
      </h3>

      <ul className="divide-y divide-border">
        {meds.map((med) => (
          <li key={med.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {med.drugName}
                  {med.hasOverride && (
                    <span className="ms-2 inline-block rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
                      {t('medicationOverride')}
                    </span>
                  )}
                </p>
                {med.startDate && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('medicationStarted', { date: med.startDate })}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
