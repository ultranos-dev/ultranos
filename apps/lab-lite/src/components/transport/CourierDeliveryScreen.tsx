'use client'

// ---------------------------------------------------------------------------
// Story 54.3 — Courier Delivery Screen (Task 7)
// Displays an active transport session and records delivery outcome.
//
// PHI rules (CLAUDE.md):
//   Rule #1: No PHI displayed — only opaque session IDs, sample counts, location IDs.
//   Rule #7: No patient demographics, names, or diagnoses appear in transport records.
//
// i18n TODO: All strings are hardcoded English. Wire up useTranslations('transport.delivery')
//            when the i18n JSON keys are added (tracked separately).
// ---------------------------------------------------------------------------

import { useState, useEffect } from 'react'
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
  // TODO i18n: const t = useTranslations('transport.delivery')

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
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <CheckCircle size={48} className="text-green-700" aria-hidden />
          </div>
          <h2 className="text-center text-2xl font-bold text-gray-900">Delivery Recorded</h2>
        </div>

        {flagCount > 0 && (
          <div
            data-testid="flag-summary-banner"
            className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-300 p-4"
            role="alert"
          >
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-lg font-semibold text-red-800">
              {flagCount} of {sampleCount} sample{sampleCount !== 1 ? 's' : ''} flagged for pre-analytical review
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
          <Truck size={28} aria-hidden />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Record Delivery</p>
          <h2 className="text-xl font-bold text-gray-900">Transport {shortSessionId}</h2>
        </div>
      </div>

      {/* Session details */}
      <div className="rounded-xl bg-gray-50 p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-base text-gray-600">Samples</span>
          <span className="text-base font-semibold text-gray-900">{session.sampleCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-base text-gray-600">Route</span>
          <span className="text-base font-semibold text-gray-900 text-end">
            {session.originLocationId} → {session.destinationLocationId}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-base text-gray-600">
            <Clock size={14} aria-hidden /> Elapsed
          </span>
          <span className="text-base font-semibold text-gray-900" data-testid="elapsed-time">
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
              ? 'bg-red-50 border-red-300'
              : 'bg-amber-50 border-amber-300'
          }`}
        >
          <AlertCircle
            size={20}
            className={`shrink-0 mt-0.5 ${stabilityWarningLevel === 'red' ? 'text-red-600' : 'text-amber-600'}`}
            aria-hidden
          />
          <p className={`text-base font-semibold ${stabilityWarningLevel === 'red' ? 'text-red-800' : 'text-amber-800'}`}>
            {stabilityWarningLevel === 'red'
              ? 'Transit time exceeds 6 hours — samples may be outside stability window'
              : 'Transit time approaching 4 hours — verify sample integrity'}
          </p>
        </div>
      )}

      {/* Temperature at arrival */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-lg font-medium text-gray-700" htmlFor="delivery-temp-input">
          <Thermometer size={18} aria-hidden /> Temperature at Arrival (°C) — optional
        </label>
        <input
          id="delivery-temp-input"
          data-testid="delivery-temp-input"
          type="number"
          value={deliveryTemp}
          onChange={(e) => setDeliveryTemp(e.target.value)}
          placeholder="e.g. 24"
          className="min-h-[56px] rounded-xl border border-gray-300 px-4 py-3 text-xl focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          inputMode="decimal"
        />
      </div>

      {/* Condition assessment */}
      <div className="flex flex-col gap-2">
        <p className="text-lg font-medium text-gray-700">Sample Condition</p>
        <div className="flex flex-col gap-2">
          <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            condition === 'acceptable' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-card hover:bg-gray-50'
          }`}>
            <input
              data-testid="condition-acceptable"
              type="radio"
              name="condition"
              value="acceptable"
              checked={condition === 'acceptable'}
              onChange={() => setCondition('acceptable')}
              className="h-5 w-5 accent-green-600"
            />
            <span className="text-lg font-semibold text-gray-900">Acceptable</span>
          </label>

          <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            condition === 'damaged' ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-card hover:bg-gray-50'
          }`}>
            <input
              data-testid="condition-damaged"
              type="radio"
              name="condition"
              value="damaged"
              checked={condition === 'damaged'}
              onChange={() => setCondition('damaged')}
              className="h-5 w-5 accent-red-600"
            />
            <span className="text-lg font-semibold text-gray-900">Damaged</span>
          </label>

          <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            condition === 'temperature-excursion' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-card hover:bg-gray-50'
          }`}>
            <input
              data-testid="condition-temperature-excursion"
              type="radio"
              name="condition"
              value="temperature-excursion"
              checked={condition === 'temperature-excursion'}
              onChange={() => setCondition('temperature-excursion')}
              className="h-5 w-5 accent-amber-600"
            />
            <span className="text-lg font-semibold text-gray-900">Temperature Excursion</span>
          </label>
        </div>
      </div>

      {submitError && (
        <p className="flex items-center gap-2 text-red-600" role="alert">
          <AlertCircle size={16} aria-hidden /> Failed to record delivery. Please try again.
        </p>
      )}

      <button
        type="button"
        data-testid="record-delivery-button"
        onClick={() => void handleRecordDelivery()}
        disabled={!condition || submitting}
        className="min-h-[56px] rounded-xl bg-green-600 px-6 py-4 text-xl font-semibold text-white hover:bg-green-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
      >
        {submitting ? 'Recording…' : 'Record Delivery'}
      </button>
    </div>
  )
}
