'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import type { LabOrderEntry } from '@/lib/db'
import { getPatientCulturalPreferences, getReceivedSampleForOrder } from '@/lib/db'
import type { CulturalFlag } from '@/lib/cultural-flags'
import { CulturalFlagsBanner } from '@/components/patients/CulturalFlagsBanner'
import { CulturalFlagsEditor } from '@/components/patients/CulturalFlagsEditor'
import { ReceiveSampleModal } from '@/components/samples/ReceiveSampleModal'
import { PatientDetailsModal } from '@/components/orders/PatientDetailsModal'

const URGENCY_STYLES: Record<string, string> = {
  stat: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  asap: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  urgent: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  routine: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  CANCELLED: 'bg-muted text-muted-foreground dark:text-muted-foreground',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '<1m' // P9: also clamps negative (future timestamp / clock skew)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatDateTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function OrderCard({ order }: { order: LabOrderEntry }) {
  const t = useTranslations('orders')
  const locale = useLocale()
  const router = useRouter()
  const [culturalFlags, setCulturalFlags] = useState<CulturalFlag[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  // True once a (non-rejected) specimen has been accessioned for this order.
  const [sampleReceived, setSampleReceived] = useState(false)

  useEffect(() => {
    getPatientCulturalPreferences(order.patientRef).then((prefs) => {
      if (prefs) setCulturalFlags(prefs.flags)
    })
  }, [order.patientRef])

  useEffect(() => {
    let cancelled = false
    getReceivedSampleForOrder(order.orderId)
      .then((s) => {
        if (!cancelled && s) setSampleReceived(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [order.orderId])

  // Short accession ref from the order UUID (last group) — for labelling specimens.
  const shortOrderId = (order.orderId.split('-').pop() ?? order.orderId).slice(-6).toUpperCase()
  const orderedAtAbsolute = formatDateTime(order.authoredOn, locale)

  // Once a sample is received the order is no longer re-receivable — activating the
  // card takes the tech to the processing worklist instead of re-opening receive.
  // The async re-check is a race guard: if the effect hasn't resolved yet but a
  // specimen already exists in the DB, we still route correctly.
  const handleCardActivate = async () => {
    const existing = await getReceivedSampleForOrder(order.orderId)
    if (existing || sampleReceived) router.push('/worklist')
    else setShowReceive(true)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCardActivate()
          }
        }}
        aria-label={
          sampleReceived
            ? t('card.viewInWorklist', { name: order.patientFirstName })
            : t('card.receiveSampleFor', { name: order.patientFirstName })
        }
        className="cursor-pointer rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Patient: first name + age — <bdi> isolates an RTL name from the LTR age
                so the two fields don't visually jumble together. */}
            <p className="flex items-center text-base font-semibold text-foreground">
              <bdi className="truncate">{order.patientFirstName}</bdi>
              <span className="mx-1.5 text-muted-foreground" aria-hidden="true">·</span>
              <span className="whitespace-nowrap font-numeric font-normal text-muted-foreground">
                {order.patientAge != null ? t('card.ageYears', { age: order.patientAge }) : '—'}
              </span>
            </p>

            {/* Cultural flags — its own interactive region; don't let it open the modal */}
            <div onClick={(e) => e.stopPropagation()}>
              <CulturalFlagsBanner flags={culturalFlags} onEditClick={() => setShowEditor(true)} />
              {showEditor && (
                <div className="mt-2">
                  <CulturalFlagsEditor
                    patientRef={order.patientRef}
                    techId=""
                    hlcTimestamp=""
                    onSave={(prefs) => {
                      setCulturalFlags(prefs.flags)
                      setShowEditor(false)
                    }}
                    onClose={() => setShowEditor(false)}
                  />
                </div>
              )}
            </div>

            {/* Tests — with LOINC code */}
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium">{t('card.testsRequested')}:</span>{' '}
              {order.testsRequested
                .map((tr) => (tr.loincCode ? `${tr.loincDisplay} (${tr.loincCode})` : tr.loincDisplay))
                .join(', ')}
            </p>

            {/* Ordering physician */}
            <p className="mt-1 text-sm text-muted-foreground">
              {t('card.orderedBy')}: {order.orderingPhysicianName}
            </p>

            {/* Order / accession reference */}
            <p className="mt-1 text-xs text-muted-foreground">
              {t('card.orderId')}: <span className="font-numeric font-medium">{shortOrderId}</span>
            </p>

            {/* Special instructions — interactive toggle; don't open the modal */}
            {order.specialInstructions && (
              <details className="mt-2" onClick={(e) => e.stopPropagation()}>
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                  {t('card.specialInstructions')}
                </summary>
                <p className="mt-1 text-sm text-muted-foreground">{order.specialInstructions}</p>
              </details>
            )}

            {/* Patient Details — opens a read-only detail modal; must not trigger receive */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDetails(true)
              }}
              className="mt-2 rounded text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('card.patientDetails')}
            </button>
          </div>

          {/* Badges + time */}
          <div className="flex flex-col items-end gap-2">
            {sampleReceived && (
              <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
                {t('card.sampleReceived')}
              </span>
            )}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${URGENCY_STYLES[order.urgency] ?? URGENCY_STYLES.routine}`}
            >
              {t(`urgency.${order.urgency}`)}
            </span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? STATUS_STYLES.RECEIVED}`}
            >
              {t(`filters.${order.status === 'IN_PROGRESS' ? 'inProgress' : order.status.toLowerCase()}`)}
            </span>
            {/* Assigned to this lab vs. available/unassigned */}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${order.assignedToLab ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
            >
              {order.assignedToLab ? t('card.assignedToYou') : t('card.available')}
            </span>
            <span className="text-xs text-muted-foreground" title={orderedAtAbsolute}>
              {t('card.orderedAt')} {timeAgo(order.authoredOn)}
            </span>
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">{orderedAtAbsolute}</span>
          </div>
        </div>
      </div>

      {showReceive && (
        <ReceiveSampleModal
          orderId={order.orderId}
          patientRef={order.patientRef}
          patientFirstName={order.patientFirstName}
          patientAge={order.patientAge}
          orders={[order]}
          onClose={() => setShowReceive(false)}
          onSuccess={() => {
            setSampleReceived(true)
            setShowReceive(false)
          }}
          onViewWorklist={() => {
            setSampleReceived(true)
            router.push('/worklist')
          }}
        />
      )}

      {showDetails && (
        <PatientDetailsModal order={order} onClose={() => setShowDetails(false)} />
      )}
    </>
  )
}
