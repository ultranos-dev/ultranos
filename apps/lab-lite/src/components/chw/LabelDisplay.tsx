'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — Label Display / Print Screen
// Displays generated label number in large font (min 32px) for handwriting.
// "Print Label" button appears only when USB printer is detected.
// Pictographic "write this on the tube" instruction.
// ---------------------------------------------------------------------------

import { useTranslations } from 'next-intl'
import { Printer, PenLine } from '@ultranos/ui-kit/icons'
import { formatLabelForDisplay, hasPrinterDetected, printLabel } from '@/lib/chw-label-generator'
import { reportCHWLabelPrintedEvent } from '@/lib/audit-client'
import type { CHWSampleType } from '@/types/chw-mode'

interface Props {
  sampleId: string
  labelNumber: string
  patientAge: number
  sampleType: CHWSampleType
  chwPractitionerId: string
  onDone: () => void
}

export function LabelDisplay({ sampleId, labelNumber, patientAge, sampleType, chwPractitionerId, onDone }: Props) {
  const t = useTranslations('chw.label')
  const printerAvailable = hasPrinterDetected()
  const displayLabel = formatLabelForDisplay(labelNumber)

  function handlePrint() {
    printLabel(labelNumber, patientAge, sampleType)
    // Audit: CHW_LABEL_PRINTED — opaque IDs only (AC #9)
    reportCHWLabelPrintedEvent({ sampleId, labelNumber, chwPractitionerId })
  }

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <h2 className="text-center text-2xl font-bold text-foreground">{t('title')}</h2>

      {/* Large label number — minimum 32px font per story spec */}
      <div className="flex w-full flex-col items-center rounded-2xl border-4 border-dashed border-primary bg-primary/10 px-6 py-8">
        <p
          className="font-mono text-4xl font-bold tracking-widest text-primary"
          aria-label={`Label number: ${labelNumber}`}
          style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}
        >
          {displayLabel}
        </p>
        <p className="mt-3 text-lg text-primary">
          {t('ageLabel', { age: patientAge })} · {t('typeLabel', { type: sampleType })}
        </p>
      </div>

      {/* Pictographic instruction — write number on tube */}
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3">
        <PenLine size={32} className="shrink-0 text-amber-700" aria-hidden />
        <p className="text-lg font-medium text-amber-800">{t('instruction')}</p>
      </div>

      {/* Print button — only if printer detected */}
      {printerAvailable && (
        <button
          type="button"
          onClick={handlePrint}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-gray-700 px-6 py-4 text-xl font-semibold text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Printer size={24} aria-hidden />
          {t('printButton')}
        </button>
      )}

      {/* Done button — returns to dashboard */}
      <button
        type="button"
        onClick={onDone}
        className="min-h-[56px] w-full rounded-xl bg-green-600 px-6 py-4 text-xl font-semibold text-white hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t('doneButton')}
      </button>
    </div>
  )
}
