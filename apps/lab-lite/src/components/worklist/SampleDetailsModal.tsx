'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { ModalHeader } from '@ultranos/ui-kit/components/ui/dialog'
import type { FhirSpecimen } from '@ultranos/shared-types'
import type { LabOrderEntry } from '@/lib/db'
import { getSampleById, getDb, getPatientCulturalPreferences } from '@/lib/db'
import type { CulturalFlag } from '@/lib/cultural-flags'
import type { PrioritizedSample } from '@/lib/prioritization-engine'
import { CulturalFlagsBanner } from '@/components/patients/CulturalFlagsBanner'
import { PatientEnrichedDetails } from '@/components/orders/PatientEnrichedDetails'
import { useOrderPatientDetails } from '@/hooks/useOrderPatientDetails'

function formatDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * Read-only detail view for a worklist sample — opens on card click for any status.
 *
 * Mirrors the orders Patient Details styling and additionally surfaces the
 * sample's collection context (lab sample ID, received time, condition, sample
 * type, collected-by, order #). Enriched PHI (full name, blood group, vitals) is
 * fetched on demand, order-scoped (CLAUDE.md Rule #7 detail-view scope). Never
 * renders the National ID or the raw patient UUID.
 */
export function SampleDetailsModal({
  sample,
  onClose,
}: {
  sample: PrioritizedSample
  onClose: () => void
}) {
  const t = useTranslations('worklist')
  const to = useTranslations('orders')
  const ts = useTranslations('samples')
  const locale = useLocale()

  const [specimen, setSpecimen] = useState<FhirSpecimen | null>(null)
  const [order, setOrder] = useState<LabOrderEntry | undefined>(undefined)
  const [flags, setFlags] = useState<CulturalFlag[]>([])
  const { details, loading: detailsLoading } = useOrderPatientDetails(sample.orderId)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getSampleById(sample.sampleId)
      if (cancelled) return
      setSpecimen(s ?? null)

      const orderId =
        (s?.request?.[0]?.reference ?? '').replace('ServiceRequest/', '') || sample.orderId
      const orderRow = orderId ? await getDb().orders.get(orderId) : undefined
      if (cancelled) return
      setOrder(orderRow)

      const patientRef = orderRow?.patientRef ?? s?.subject?.reference ?? ''
      if (patientRef) {
        const prefs = await getPatientCulturalPreferences(patientRef)
        if (!cancelled && prefs) setFlags(prefs.flags)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sample.sampleId, sample.orderId])

  const shortOrderId = (sample.orderId.split('-').pop() ?? sample.orderId).slice(-6).toUpperCase()

  // Normalize enum values to their localized, properly-cased labels (never raw
  // lowercase codes like "blood" / "acceptable" / "in-processing").
  const SAMPLE_TYPE_KEYS = new Set(['blood', 'urine', 'swab', 'csf', 'stool', 'other'])
  const CONDITION_KEYS = new Set(['acceptable', 'hemolyzed', 'clotted', 'insufficient', 'mislabeled'])
  const STATUS_KEY: Record<string, string> = {
    received: 'received',
    'in-processing': 'inProcessing',
    completed: 'completed',
    reported: 'reported',
    rejected: 'rejected',
  }

  const rawType = specimen?.type?.coding?.[0]?.code ?? specimen?.type?.coding?.[0]?.display
  const sampleType = rawType
    ? SAMPLE_TYPE_KEYS.has(rawType) ? ts(`sampleTypes.${rawType}`) : rawType
    : '—'
  const rawCondition = specimen?._ultranos.sampleCondition
  const condition = rawCondition
    ? CONDITION_KEYS.has(rawCondition) ? ts(`conditions.${rawCondition}`) : rawCondition
    : '—'
  const collectedBy =
    (specimen?.collection?.collector?.reference ?? '').replace('Practitioner/', '') || '—'
  const pipelineStatus = specimen?._ultranos.pipelineStatus
  const isArchived = specimen?._ultranos.archived === true
  const isExpired = sample.stabilityStatus === 'expired'

  // Status precedence: an expired sample reads "Expired" (a real sample can be
  // in-processing AND expired — expiry is the clinically meaningful state here),
  // then Archived, then the normalized pipeline status.
  const pipelineLabel = pipelineStatus
    ? STATUS_KEY[pipelineStatus] ? ts(`status.${STATUS_KEY[pipelineStatus]}`) : pipelineStatus
    : '—'
  const statusValue: React.ReactNode = isExpired
    ? <span className="font-medium text-destructive">{t('details.expired')}</span>
    : isArchived
      ? t('statusFilter.archived')
      : pipelineLabel

  const tests =
    (order?.testsRequested?.length
      ? order.testsRequested
      : specimen && Array.isArray((specimen._ultranos as { orderedTests?: LabOrderEntry['testsRequested'] }).orderedTests)
        ? (specimen._ultranos as { orderedTests?: LabOrderEntry['testsRequested'] }).orderedTests!
        : [{ loincCode: sample.loincCode, loincDisplay: sample.loincDisplay }])
      .map((tr) => (tr.loincCode ? `${tr.loincDisplay} (${tr.loincCode})` : tr.loincDisplay))
      .filter(Boolean)
      .join(', ') || '—'

  // Collection context — sample-specific.
  const collectionRows: Array<{ label: string; value: React.ReactNode; numeric?: boolean }> = [
    { label: t('details.labSampleId'), value: specimen?._ultranos.labSampleId ?? '—', numeric: true },
    { label: t('details.receivedAt'), value: formatDateTime(specimen?.receivedTime, locale) },
    { label: t('details.sampleType'), value: sampleType },
    { label: t('details.condition'), value: condition },
    { label: t('details.collectedBy'), value: collectedBy, numeric: true },
    { label: t('details.status'), value: statusValue },
  ]

  // Order context — reuses the orders namespace labels.
  const orderRows: Array<{ label: string; value: React.ReactNode; numeric?: boolean }> = [
    { label: to('details.tests'), value: tests },
    ...(order ? [{ label: to('card.orderedBy'), value: order.orderingPhysicianName }] : []),
    ...(order ? [{ label: to('details.urgency'), value: to(`urgency.${order.urgency}`) }] : []),
    { label: to('card.orderId'), value: shortOrderId, numeric: true },
    ...(order ? [{ label: to('card.orderedAt'), value: formatDateTime(order.authoredOn, locale) }] : []),
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sample-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      data-testid="sample-details-modal"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          title={t('details.title')}
          titleId="sample-details-title"
          onClose={onClose}
          closeLabel={to('details.close')}
        />

        <div className="space-y-4 px-6 py-4">
          {/* Patient — avatar centered on its own row, name below, age is a field. */}
          <section>
            <div className="mb-2 flex justify-center">
              <Avatar
                src={details?.photoUrl ?? order?.patientPhotoUrl}
                name={details?.fullName.given ?? sample.patientRef.firstName}
                size={72}
                ring
              />
            </div>
            <p className="mb-3 text-center text-base font-bold text-foreground">
              <bdi>{sample.patientRef.firstName || '—'}</bdi>
            </p>
            <PatientEnrichedDetails
              details={details}
              loading={detailsLoading}
              age={sample.patientRef.age > 0 ? sample.patientRef.age : undefined}
            />
          </section>

          {/* Collection context — sample-specific */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{t('details.collectionSection')}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {collectionRows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="font-medium text-muted-foreground">{row.label}</dt>
                  <dd className={`text-foreground ${row.numeric ? 'font-numeric' : ''}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Order context */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">{to('details.orderSection')}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {orderRows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="font-medium text-muted-foreground">{row.label}</dt>
                  <dd className={`text-foreground ${row.numeric ? 'font-numeric' : ''}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Cultural care preferences — banner self-hides if none active. */}
          <div>
            <p className="mb-1 text-sm font-medium text-muted-foreground">{to('details.culturalFlags')}</p>
            {flags.some((f) => f.isActive) ? (
              <CulturalFlagsBanner flags={flags} />
            ) : (
              <p className="text-sm text-muted-foreground">{to('details.noCulturalFlags')}</p>
            )}
          </div>

          {/* Rule #7 reminder */}
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">{to('details.dataMinNote')}</p>
        </div>
      </div>
    </div>
  )
}
