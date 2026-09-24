'use client'

// ---------------------------------------------------------------------------
// Story 54.3 — Courier Delivery Screen (Task 7)
// Displays an active transport session and records delivery outcome.
//
// PHI rules (CLAUDE.md):
//   Rule #1: No PHI displayed — only opaque session IDs, sample counts, location IDs.
//   Rule #7: No patient demographics, names, or diagnoses appear in transport records.
//
// Story 63.1: strings keyed under the transport.delivery namespace.
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Truck, Thermometer, CheckCircle, AlertCircle, Clock } from '@ultranos/ui-kit/icons'
import { recordDelivery } from '@/lib/transport-service'
import type { TransportSession, DeliveryInput } from '@/types/transport'

export interface CourierDeliveryScreenProps {
  session: TransportSession
  onDelivered: (updatedSession: TransportSession) => void
}

type ConditionValue = 'acceptable' | 'damaged' | 'temperature-excursion'

// Compute elapsed hours from a HLC-serialized or ISO timestamp to now
function getElapsedHours(pickupTimestamp: string): number {
  try {
    const pickupMs = new Date(pickupTimestamp).getTime()
    if (isNaN(pickupMs)) return 0
    return (Date.now() - pickupMs) / (1000 * 60 * 60)
  } catch {
    return 0
  }
}

function formatElapsedTime(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return `${minutes} min`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function CourierDeliveryScreen({ session, onDelivered }: CourierDeliveryScreenProps) {
  const t = useTranslations('transport.delivery')

  const [deliveryTemp, setDeliveryTemp] = useState('')
  const [condition, setCondition] = useState<ConditionValue | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [delivered, setDelivered] = useState(false)
  const [deliveredSession, setDeliveredSession] = useState<TransportSession | null>(null)
  const [elapsedHours, setElapsedHours] = useState(() => getElapsedHours(session.pickupTimestamp))

  // Refresh elapsed time every 30 seconds so the displayed time stays current
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedHours(getElapsedHours(session.pickupTimestamp))
    }, 30_000)
    return () => clearInterval(interval)
  }, [session.pickupTimestamp])

  // Truncate session ID for display — no PHI, just cosmetic shortening
  const shortSessionId = session.id.length > 12 ? `${session.id.slice(0, 8)}…` : session.id

  // P16: Stability warning level — conservative heuristic based on the blood stability window (6h,
  // the tightest common window). Amber at 4h gives staff a 2-hour warning before blood exceeds its
  // window. Per-specimen checks run in recordDelivery() using DEFAULT_STABILITY_WINDOWS.
  const stabilityWarningLevel: 'none' | 'amber' | 'red' =
    elapsedHours > 6 ? 'red' : elapsedHours > 4 ? 'amber' : 'none'

  async function handleRecordDelivery() {
    if (!condition) return
    setSubmitting(true)
    setSubmitError(false)
    try {
      const input: DeliveryInput = {
        conditionAtDelivery: condition,
        deliveryTemperature: deliveryTemp ? parseFloat(deliveryTemp) : undefined,
      }
      const updated = await recordDelivery(session.id, input)
      setDeliveredSession(updated)
      setDelivered(true)
      onDelivered(updated)
    } catch {
      // CLAUDE.md Rule #1: no PHI or session IDs in error message
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  // ------------ Post-delivery view ------------

  if (delivered && deliveredSession) {
    const flagCount = deliveredSession.flags.length
    const sampleCount = deliveredSession.sampleCount

    return (
      <div className="flex flex-col gap-4 p-4" data-testid="courier-delivery-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success/10">
            <CheckCircle size={48} className="text-success" aria-hidden />
          </div>
          <h2 className="text-center text-2xl font-bold text-foreground">{t('deliveryRecorded')}</h2>
        </div>

        {flagCount > 0 && (
          <div
            data-testid="flag-summary-banner"
            className="flex items-start gap-3 rounded-xl bg-destructive/10 border border-destructive/30 p-4"
            role="alert"
          >
            <AlertCircle size={20} className="text-destructive shrink-0 mt-0.5" aria-hidden />
            <p className="text-lg font-semibold text-destructive">
              {t('flagSummary', { flagCount, sampleCount })}
            </p>
          </div>
        )}
      </div>
    )
  }

  // ------------ Delivery form ------------

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="courier-delivery-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Truck size={28} aria-hidden />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('recordDeliveryHeading')}</p>
          <h2 className="text-xl font-bold text-foreground">{t('transportSession', { id: shortSessionId })}</h2>
        </div>
      </div>

      {/* Session details */}
      <div className="rounded-xl bg-muted p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-base text-muted-foreground">{t('samplesLabel')}</span>
          <span className="text-base font-semibold text-foreground">{session.sampleCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-base text-muted-foreground">{t('routeLabel')}</span>
          <span className="text-base font-semibold text-foreground text-end">
            {session.originLocationId} → {session.destinationLocationId}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-base text-muted-foreground">
            <Clock size={14} aria-hidden /> {t('elapsedLabel')}
          </span>
          <span className="text-base font-semibold text-foreground" data-testid="elapsed-time">
            {formatElapsedTime(elapsedHours)}
          </span>
        </div>
      </div>

      {/* Stability warning */}
      {stabilityWarningLevel !== 'none' && (
        <div
          data-testid="stability-warning"
          role="alert"
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            stabilityWarningLevel === 'red'
              ? 'bg-destructive/10 border-destructive/30'
              : 'bg-warning/10 border-warning/30'
          }`}
        >
          <AlertCircle
            size={20}
            className={`shrink-0 mt-0.5 ${stabilityWarningLevel === 'red' ? 'text-destructive' : 'text-warning'}`}
            aria-hidden
          />
          <p className={`text-base font-semibold ${stabilityWarningLevel === 'red' ? 'text-destructive' : 'text-warning'}`}>
            {stabilityWarningLevel === 'red'
              ? t('stabilityWarningRed')
              : t('stabilityWarningAmber')}
          </p>
        </div>
      )}

      {/* Temperature at arrival */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-lg font-medium text-foreground" htmlFor="delivery-temp-input">
          <Thermometer size={18} aria-hidden /> {t('temperatureLabel')}
        </label>
        <input
          id="delivery-temp-input"
          data-testid="delivery-temp-input"
          type="number"
          value={deliveryTemp}
          onChange={(e) => setDeliveryTemp(e.target.value)}
          placeholder={t('temperaturePlaceholder')}
          className="min-h-[56px] rounded-xl border border-border px-4 py-3 text-xl focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          inputMode="decimal"
        />
      </div>

      {/* Condition assessment */}
      <div className="flex flex-col gap-2">
        <p className="text-lg font-medium text-foreground">{t('sampleConditionLabel')}</p>
        <div className="flex flex-col gap-2">
          <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            condition === 'acceptable' ? 'border-success bg-success/10' : 'border-border bg-card hover:bg-muted'
          }`}>
            <input
              data-testid="condition-acceptable"
              type="radio"
              name="condition"
              value="acceptable"
              checked={condition === 'acceptable'}
              onChange={() => setCondition('acceptable')}
              className="h-5 w-5 accent-success"
            />
            <span className="text-lg font-semibold text-foreground">{t('conditionAcceptable')}</span>
          </label>

          <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            condition === 'damaged' ? 'border-destructive bg-destructive/10' : 'border-border bg-card hover:bg-muted'
          }`}>
            <input
              data-testid="condition-damaged"
              type="radio"
              name="condition"
              value="damaged"
              checked={condition === 'damaged'}
              onChange={() => setCondition('damaged')}
              className="h-5 w-5 accent-destructive"
            />
            <span className="text-lg font-semibold text-foreground">{t('conditionDamaged')}</span>
          </label>

          <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            condition === 'temperature-excursion' ? 'border-warning bg-warning/10' : 'border-border bg-card hover:bg-muted'
          }`}>
            <input
              data-testid="condition-temperature-excursion"
              type="radio"
              name="condition"
              value="temperature-excursion"
              checked={condition === 'temperature-excursion'}
              onChange={() => setCondition('temperature-excursion')}
              className="h-5 w-5 accent-warning"
            />
            <span className="text-lg font-semibold text-foreground">{t('conditionTemperatureExcursion')}</span>
          </label>
        </div>
      </div>

      {submitError && (
        <p className="flex items-center gap-2 text-destructive" role="alert">
          <AlertCircle size={16} aria-hidden /> {t('recordDeliveryError')}
        </p>
      )}

      <button
        type="button"
        data-testid="record-delivery-button"
        onClick={() => void handleRecordDelivery()}
        disabled={!condition || submitting}
        className="min-h-[56px] rounded-xl bg-success px-6 py-4 text-xl font-semibold text-white hover:bg-success disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
      >
        {submitting ? t('recording') : t('recordDeliveryButton')}
      </button>
    </div>
  )
}
