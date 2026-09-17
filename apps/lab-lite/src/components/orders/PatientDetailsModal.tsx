'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import type { LabOrderEntry } from '@/lib/db'
import { getPatientCulturalPreferences } from '@/lib/db'
import type { CulturalFlag } from '@/lib/cultural-flags'
import { CulturalFlagsBanner } from '@/components/patients/CulturalFlagsBanner'
import { PatientEnrichedDetails } from '@/components/orders/PatientEnrichedDetails'
import { useOrderPatientDetails } from '@/hooks/useOrderPatientDetails'

function formatDateTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * Read-only patient + order detail view for the lab worklist.
 *
 * PHI (CLAUDE.md Rule #7, detail-view scope): shows the patient's full name,
 * blood group, and latest basic vitals (fetched on demand, order-scoped) plus the
 * non-identifying order context. It never renders the National ID (hash-only) or
 * the raw patient UUID (blind-indexed by design).
 */
export function PatientDetailsModal({
  order,
  onClose,
}: {
  order: LabOrderEntry
  onClose: () => void
}) {
  const t = useTranslations('orders')
  const locale = useLocale()
  const [flags, setFlags] = useState<CulturalFlag[]>([])
  const { details, loading } = useOrderPatientDetails(order.orderId)

  useEffect(() => {
    getPatientCulturalPreferences(order.patientRef).then((prefs) => {
      if (prefs) setFlags(prefs.flags)
    })
  }, [order.patientRef])

  const shortOrderId = (order.orderId.split('-').pop() ?? order.orderId).slice(-6).toUpperCase()
  const tests = order.testsRequested
    .map((tr) => (tr.loincCode ? `${tr.loincDisplay} (${tr.loincCode})` : tr.loincDisplay))
    .join(', ')

  const orderRows: Array<{ label: string; value: React.ReactNode; numeric?: boolean }> = [
    { label: t('details.tests'), value: tests },
    { label: t('card.orderedBy'), value: order.orderingPhysicianName },
    { label: t('details.urgency'), value: t(`urgency.${order.urgency}`) },
    { label: t('card.orderId'), value: shortOrderId, numeric: true },
    { label: t('card.orderedAt'), value: formatDateTime(order.authoredOn, locale) },
    ...(order.specialInstructions
      ? [{ label: t('card.specialInstructions'), value: order.specialInstructions }]
      : []),
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      data-testid="patient-details-modal"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <h2 id="patient-details-title" className="text-lg font-semibold text-foreground">
            {t('details.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('details.close')}
            className="rounded p-1 text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {/* Patient — identity + clinical (fetched on demand, Rule #7 detail scope) */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{t('details.patientSection')}</h3>
            {/* Avatar header — shows photo when available (signed URL from hub), else initials */}
            <div className="mb-3 flex items-center gap-3">
              <Avatar
                src={details?.photoUrl}
                name={details?.fullName.given ?? order.patientFirstName}
                size={72}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {order.patientFirstName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.patientAge != null ? t('card.ageYears', { age: order.patientAge }) : '—'}
                </p>
              </div>
            </div>
            <PatientEnrichedDetails details={details} loading={loading} />
          </section>

          {/* Order context */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{t('details.orderSection')}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {orderRows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="font-medium text-muted-foreground">{row.label}</dt>
                  <dd className={`text-foreground ${row.numeric ? 'font-numeric' : ''}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Cultural care preferences (guidance, not warnings). Banner self-hides if none. */}
          <div>
            <p className="mb-1 text-sm font-medium text-muted-foreground">{t('details.culturalFlags')}</p>
            {flags.some((f) => f.isActive) ? (
              <CulturalFlagsBanner flags={flags} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('details.noCulturalFlags')}</p>
            )}
          </div>

          {/* Rule #7 reminder */}
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">{t('details.dataMinNote')}</p>
        </div>
      </div>
    </div>
  )
}
