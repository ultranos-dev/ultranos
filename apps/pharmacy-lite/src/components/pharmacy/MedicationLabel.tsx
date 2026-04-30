'use client'

import type { FulfillmentItem } from '@/stores/fulfillment-store'

const TIMING_LABELS: Record<string, Record<string, string>> = {
  en: { morning: 'Morning', noon: 'Noon', night: 'Night' },
  ar: { morning: 'صباح', noon: 'ظهر', night: 'مساء' },
  fa: { morning: 'صبح', noon: 'ظهر', night: 'شب' },
}

interface MedicationLabelProps {
  item: FulfillmentItem
  dir?: 'ltr' | 'rtl' | 'auto'
  locale?: string
}

/** Sun icon — Morning dosage */
function SunIcon({ label = 'Morning' }: { label?: string }) {
  return (
    <svg
      data-testid="timing-icon-morning"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-8 w-8 text-amber-500"
      aria-label={label}
      role="img"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** Food/plate icon — Noon/midday dosage */
function FoodIcon({ label = 'Noon' }: { label?: string }) {
  return (
    <svg
      data-testid="timing-icon-noon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-orange-500"
      aria-label={label}
      role="img"
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </svg>
  )
}

/** Moon icon — Night dosage */
function MoonIcon({ label = 'Night' }: { label?: string }) {
  return (
    <svg
      data-testid="timing-icon-night"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-8 w-8 text-indigo-500"
      aria-label={label}
      role="img"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

/**
 * Determine which timing icons to show based on frequency per day.
 * - 1x daily → Morning
 * - 2x daily → Morning + Night
 * - 3x daily → Morning + Noon + Night
 * - 4x+ daily → Morning + Noon + Night (with frequency note)
 */
function getTimingSlots(freqN?: number): ('morning' | 'noon' | 'night')[] {
  if (!freqN || freqN <= 0) return []
  if (freqN === 1) return ['morning']
  if (freqN === 2) return ['morning', 'night']
  return ['morning', 'noon', 'night']
}

/**
 * MedicationLabel — a printable patient-facing label with low-literacy
 * visual icons for dosage timing. Supports RTL for Arabic/Dari.
 */
export function MedicationLabel({ item, dir, locale = 'en' }: MedicationLabelProps) {
  const { prescription, brandName, batchLot } = item
  const timingSlots = getTimingSlots(prescription.dos.freqN)
  const labels = TIMING_LABELS[locale] ?? TIMING_LABELS.en

  return (
    <div
      data-testid="medication-label"
      dir={dir ?? 'auto'}
      className="print-label rounded-lg border-2 border-neutral-300 p-4"
    >
      {/* Medication name — largest text for readability */}
      <h3 data-testid="label-med-name" className="text-xl font-bold text-neutral-900">
        {prescription.medT}
      </h3>

      {/* Brand name */}
      {brandName && (
        <p data-testid="label-brand-name" className="text-base text-neutral-600">
          {brandName}
        </p>
      )}

      {/* Dosage */}
      <p data-testid="label-dosage" className="mt-2 text-lg font-semibold text-neutral-800">
        {prescription.dos.qty} {prescription.dos.unit}
        {prescription.dos.freqN && prescription.dos.freqN > 3 && (
          <span className="text-sm font-normal text-neutral-600">
            {' '}({prescription.dos.freqN}× daily)
          </span>
        )}
      </p>

      {/* Visual timing icons */}
      {timingSlots.length > 0 && (
        <div className="mt-3 flex items-center gap-4" role="group" aria-label="Dosage timing">
          {timingSlots.map((slot) => (
            <div key={slot} className="flex flex-col items-center gap-1">
              {slot === 'morning' && <SunIcon label={labels.morning} />}
              {slot === 'noon' && <FoodIcon label={labels.noon} />}
              {slot === 'night' && <MoonIcon label={labels.night} />}
              <span className="text-xs font-medium text-neutral-600">{labels[slot]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Duration */}
      <p data-testid="label-duration" className="mt-3 text-base text-neutral-700">
        {prescription.dur} days
      </p>

      {/* Batch/Lot (optional) */}
      {batchLot && (
        <p data-testid="label-batch" className="mt-1 text-xs text-neutral-400">
          Lot: {batchLot}
        </p>
      )}
    </div>
  )
}
