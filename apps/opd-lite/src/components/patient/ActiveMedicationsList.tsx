'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@ultranos/ui-kit'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { db } from '@/lib/db'
import { Card } from '@/components/Card'

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

/**
 * Read-only list of active medications for a patient, loaded from
 * the Dexie `medicationStatements` table.
 *
 * Displays drug name, dosage, frequency, start date, and an amber
 * override flag when a matching interaction audit entry has an
 * override reason recorded.
 */
export function ActiveMedicationsList({
  patientId,
}: ActiveMedicationsListProps) {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('patient')
  const [meds, setMeds] = useState<MedicationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadMedications() {
      try {
        const patientRef = `Patient/${patientId}`

        // Load active medication statements for this patient
        const statements = await db.medicationStatements
          .where('subject.reference')
          .equals(patientRef)
          .toArray()

        const activeStatements = statements.filter(
          (s) => s.status === 'active',
        )

        // Load interaction audit entries for override detection
        const auditEntries = await db.interactionAuditLog
          .where('patientId')
          .equals(patientId)
          .toArray()

        // Index overrides by medicationRequestId for fast lookup
        const overrideIds = new Set(
          auditEntries
            .filter((e) => e.overrideReason)
            .map((e) => e.medicationRequestId),
        )

        if (cancelled) return

        const rows: MedicationRow[] = activeStatements.map((stmt) => {
          // Drug name
          const coding = stmt.medicationCodeableConcept?.coding?.[0]
          const drugName =
            coding?.display ?? stmt.medicationCodeableConcept?.text ?? ''

          // Start date from effectivePeriod
          const startDate = formatStartDate(stmt.effectivePeriod?.start, locale)

          // Override flag: check if source prescription has an override entry
          const hasOverride = stmt._ultranos.sourcePrescriptionId
            ? overrideIds.has(stmt._ultranos.sourcePrescriptionId)
            : false

          return {
            id: stmt.id,
            drugName,
            startDate,
            hasOverride,
          }
        })

        setMeds(rows)
      } catch {
        // Fail silently — show empty state
        setMeds([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadMedications()
    return () => { cancelled = true }
  }, [patientId, locale])

  if (loading) {
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

  if (meds.length === 0) {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('activeMedications')}
        </h3>
        <EmptyState size="sm" title={t('noActiveMedications')} />
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
