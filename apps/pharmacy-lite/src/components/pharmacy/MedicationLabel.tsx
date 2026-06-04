'use client'

import { Sun, Utensils, Moon } from '@ultranos/ui-kit/icons'
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
    <Sun
      data-testid="timing-icon-morning"
      className="h-8 w-8 text-amber-500"
      aria-label={label}
      role="img"
    />
  )
}

/** Food/plate icon — Noon/midday dosage */
function FoodIcon({ label = 'Noon' }: { label?: string }) {
  return (
    <Utensils
      data-testid="timing-icon-noon"
      className="h-8 w-8 text-orange-500"
      aria-label={label}
      role="img"
    />
  )
}

/** Moon icon — Night dosage */
function MoonIcon({ label = 'Night' }: { label?: string }) {
  return (
    <Moon
      data-testid="timing-icon-night"
      className="h-8 w-8 text-indigo-500"
      aria-label={label}
      role="img"
    />
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
      className="print-label rounded-2xl border-2 border-border p-4"
    >
      {/* Medication name — largest text for readability */}
      <h3 data-testid="label-med-name" className="text-xl font-bold text-foreground">
        {prescription.medT}
      </h3>

      {/* Brand name */}
      {brandName && (
        <p data-testid="label-brand-name" className="text-base text-muted-foreground">
          {brandName}
        </p>
      )}

      {/* Dosage */}
      <p data-testid="label-dosage" className="mt-2 text-lg font-semibold text-foreground">
        {prescription.dos.qty} {prescription.dos.unit}
        {prescription.dos.freqN && prescription.dos.freqN > 3 && (
          <span className="text-sm font-normal text-muted-foreground">
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
              <span className="text-xs font-medium text-muted-foreground">{labels[slot]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Duration */}
      <p data-testid="label-duration" className="mt-3 text-base text-foreground">
        {prescription.dur} days
      </p>

      {/* Batch/Lot (optional) */}
      {batchLot && (
        <p data-testid="label-batch" className="mt-1 text-xs text-muted-foreground">
          Lot: {batchLot}
        </p>
      )}
    </div>
  )
}
