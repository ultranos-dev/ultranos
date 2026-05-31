'use client'

/**
 * Story 43.2 — QC Run Entry Form
 *
 * Allows a lab technician to record a new QC run for an analyte/instrument.
 * Auto-calculates pass/fail based on whether the measured value falls within
 * the expected range.
 *
 * RTL: uses logical CSS properties. No PHI involved.
 */

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { saveQcRun } from '@/services/qc-run-service'
import type { QcRun } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface QcRunEntryFormProps {
  /** Called after a QC run is successfully saved. */
  onSaved?: (run: QcRun) => void
}

function generateId(): string {
  return crypto.randomUUID()
}

export function QcRunEntryForm({ onSaved }: QcRunEntryFormProps) {
  const t = useTranslations('qc')
  const session = useAuthSessionStore((s) => s.session)
  const formId = useId()

  const [analyte, setAnalyte] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [controlLevel, setControlLevel] = useState('L1')
  const [measuredValue, setMeasuredValue] = useState('')
  const [expectedLow, setExpectedLow] = useState('')
  const [expectedHigh, setExpectedHigh] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedRun, setSavedRun] = useState<QcRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-calculate pass/fail from current inputs
  const measured = parseFloat(measuredValue)
  const low = parseFloat(expectedLow)
  const high = parseFloat(expectedHigh)
  const hasValidInputs =
    !isNaN(measured) && !isNaN(low) && !isNaN(high) && low <= high
  const passOrFail: 'PASS' | 'FAIL' | null = hasValidInputs
    ? measured >= low && measured <= high
      ? 'PASS'
      : 'FAIL'
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!analyte.trim()) { setError(t('form.error.analyteRequired')); return }
    if (!instrumentId.trim()) { setError(t('form.error.instrumentRequired')); return }
    if (!hasValidInputs) { setError(t('form.error.invalidValues')); return }

    const run: QcRun = {
      id: generateId(),
      analyte: analyte.trim(),
      instrumentId: instrumentId.trim(),
      controlLevel,
      controlValues: { value: measured },
      expectedRange: { low, high },
      passOrFail: passOrFail!,
      timestamp: serializeHlc(hlc.now()),
      calendarDate: new Date().toISOString().slice(0, 10),
      techId: session?.userId ?? 'unknown',
    }

    setSaving(true)
    try {
      await saveQcRun(run)
      setSavedRun(run)
      // Reset form
      setAnalyte('')
      setInstrumentId('')
      setControlLevel('L1')
      setMeasuredValue('')
      setExpectedLow('')
      setExpectedHigh('')
      onSaved?.(run)
    } catch (err) {
      setError(t('form.error.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby={`${formId}-heading`}>
      <h2
        id={`${formId}-heading`}
        style={{ fontSize: '1rem', fontWeight: 600, marginBlockEnd: '1rem' }}
      >
        {t('form.title')}
      </h2>

      {savedRun && (
        <div
          role="status"
          style={{
            padding: '0.75rem',
            marginBlockEnd: '1rem',
            borderRadius: '0.375rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            fontSize: '0.875rem',
          }}
        >
          {t('form.savedSuccess', {
            result: savedRun.passOrFail === 'PASS' ? t('result.pass') : t('result.fail'),
          })}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            marginBlockEnd: '1rem',
            borderRadius: '0.375rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          gap: '1rem',
          marginBlockEnd: '1rem',
        }}
      >
        {/* Analyte */}
        <div>
          <label
            htmlFor={`${formId}-analyte`}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBlockEnd: '0.25rem' }}
          >
            {t('form.analyte')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-analyte`}
            type="text"
            value={analyte}
            onChange={(e) => setAnalyte(e.target.value)}
            placeholder={t('form.analytePlaceholder')}
            required
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {/* Instrument */}
        <div>
          <label
            htmlFor={`${formId}-instrument`}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBlockEnd: '0.25rem' }}
          >
            {t('form.instrument')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-instrument`}
            type="text"
            value={instrumentId}
            onChange={(e) => setInstrumentId(e.target.value)}
            placeholder={t('form.instrumentPlaceholder')}
            required
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {/* Control Level */}
        <div>
          <label
            htmlFor={`${formId}-level`}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBlockEnd: '0.25rem' }}
          >
            {t('form.controlLevel')}
          </label>
          <select
            id={`${formId}-level`}
            value={controlLevel}
            onChange={(e) => setControlLevel(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <option value="L1">{t('form.level.l1')}</option>
            <option value="L2">{t('form.level.l2')}</option>
            <option value="L3">{t('form.level.l3')}</option>
          </select>
        </div>

        {/* Measured value */}
        <div>
          <label
            htmlFor={`${formId}-measured`}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBlockEnd: '0.25rem' }}
          >
            {t('form.measuredValue')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-measured`}
            type="number"
            step="any"
            value={measuredValue}
            onChange={(e) => setMeasuredValue(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {/* Expected low */}
        <div>
          <label
            htmlFor={`${formId}-low`}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBlockEnd: '0.25rem' }}
          >
            {t('form.expectedLow')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-low`}
            type="number"
            step="any"
            value={expectedLow}
            onChange={(e) => setExpectedLow(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {/* Expected high */}
        <div>
          <label
            htmlFor={`${formId}-high`}
            style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBlockEnd: '0.25rem' }}
          >
            {t('form.expectedHigh')} <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-high`}
            type="number"
            step="any"
            value={expectedHigh}
            onChange={(e) => setExpectedHigh(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
        </div>
      </div>

      {/* Auto-calculated result preview */}
      {passOrFail && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            marginBlockEnd: '1rem',
            borderRadius: '0.375rem',
            backgroundColor: passOrFail === 'PASS' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${passOrFail === 'PASS' ? '#86efac' : '#fca5a5'}`,
            color: passOrFail === 'PASS' ? '#166534' : '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          <strong>{t('form.calculatedResult')}:</strong>
          <span>{passOrFail === 'PASS' ? t('result.pass') : t('result.fail')}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !hasValidInputs || !analyte.trim() || !instrumentId.trim()}
        style={{
          padding: '0.625rem 1.25rem',
          backgroundColor: saving ? '#93c5fd' : '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? t('form.saving') : t('form.save')}
      </button>
    </form>
  )
}
