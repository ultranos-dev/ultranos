'use client'

/**
 * Simplified Result Entry — Story 54.5 (AC #5)
 *
 * High-throughput data entry for the outbreak target test.
 * Reduced fields: sample ID (scan or enter), result, timestamp (auto), tech ID (auto).
 *
 * Large touch targets for mobile use in a surge environment.
 * Result still requires authorization per Story 42.5 (authorization is upstream).
 *
 * No PHI in component itself — sampleId is an opaque lab identifier.
 */

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { OutbreakModeConfig } from '@/types/outbreak'

export type SimplifiedResultValue = 'positive' | 'negative' | 'indeterminate'

export interface SimplifiedResultSubmission {
  sampleId: string
  result: SimplifiedResultValue
  timestamp: string
  techId: string
  testLoincCode: string
  outbreakConfigId: string
}

interface Props {
  outbreakConfig: OutbreakModeConfig
  /** Called with the result submission for caller to handle (authorize + persist) */
  onSubmit: (submission: SimplifiedResultSubmission) => Promise<void>
  onClose: () => void
}

export function SimplifiedResultEntry({ outbreakConfig, onSubmit, onClose }: Props) {
  const t = useTranslations('outbreak')
  const session = useAuthSessionStore((s) => s.session)
  const [sampleId, setSampleId] = useState('')
  const [result, setResult] = useState<SimplifiedResultValue | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null)
  const sampleInputRef = useRef<HTMLInputElement>(null)

  const targetTestCode = outbreakConfig.targetTestCodes[0] ?? ''

  const RESULT_BUTTONS: Array<{ value: SimplifiedResultValue; label: string; color: string; bg: string }> = [
    { value: 'positive', label: t('fastEntryResultPositive'), color: '#fff', bg: '#dc2626' },
    { value: 'negative', label: t('fastEntryResultNegative'), color: '#fff', bg: '#16a34a' },
    { value: 'indeterminate', label: t('fastEntryResultIndeterminate'), color: '#fff', bg: '#d97706' },
  ]

  async function handleSubmit() {
    if (!sampleId.trim()) {
      setError(t('fastEntryErrorSampleId'))
      return
    }
    if (!result) {
      setError(t('fastEntryErrorResult'))
      return
    }
    if (!session) {
      setError(t('fastEntryErrorSession'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const submission: SimplifiedResultSubmission = {
        sampleId: sampleId.trim(),
        result,
        timestamp: new Date().toISOString(),
        techId: session.practitionerId,
        testLoincCode: targetTestCode,
        outbreakConfigId: outbreakConfig.id,
      }
      await onSubmit(submission)
      setLastSubmitted(sampleId.trim())
      // Reset for next entry (high-throughput flow)
      setSampleId('')
      setResult(null)
      sampleInputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fastEntrySubmissionFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      data-testid="simplified-result-entry"
      style={{
        backgroundColor: '#fff',
        border: '2px solid #dc2626',
        borderRadius: '8px',
        padding: '1.5rem',
        maxWidth: '480px',
        width: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
            {t('fastEntryTitle')}
          </h3>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            {outbreakConfig.targetPathogen.display} — {targetTestCode}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('fastEntryCloseAriaLabel')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280' }}
        >
          ×
        </button>
      </div>

      {lastSubmitted && (
        <div
          role="status"
          style={{
            backgroundColor: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: '4px', padding: '0.5rem 0.75rem',
            color: '#166534', fontSize: '0.875rem', marginBlockEnd: '1rem',
          }}
        >
          {t('fastEntrySubmitted', { sampleId: lastSubmitted })}
        </div>
      )}

      {/* Sample ID — large input, supports barcode scan */}
      <div style={{ marginBlockEnd: '1.25rem' }}>
        <label htmlFor="sample-id-input" style={{ display: 'block', fontWeight: 600, marginBlockEnd: '0.375rem' }}>
          {t('fastEntrySampleIdLabel')}
        </label>
        <input
          id="sample-id-input"
          ref={sampleInputRef}
          type="text"
          value={sampleId}
          onChange={(e) => setSampleId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && result && handleSubmit()}
          placeholder={t('fastEntrySampleIdPlaceholder')}
          autoFocus
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '1.125rem',          // Large for touch
            borderRadius: '6px',
            border: '2px solid #d1d5db',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Result buttons — large touch targets */}
      <div style={{ marginBlockEnd: '1.25rem' }}>
        <p style={{ fontWeight: 600, marginBlockEnd: '0.5rem' }}>{t('fastEntryResultLabel')}</p>
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
          {RESULT_BUTTONS.map(({ value, label, color, bg }) => (
            <button
              key={value}
              type="button"
              onClick={() => setResult(value)}
              data-testid={`result-btn-${value}`}
              aria-pressed={result === value}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '1rem 0.75rem',   // Large touch target (AC #8.3)
                fontSize: '0.9375rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: result === value ? `3px solid ${bg}` : '2px solid #d1d5db',
                backgroundColor: result === value ? bg : '#f9fafb',
                color: result === value ? color : '#374151',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-populated fields (read-only) */}
      <div style={{
        backgroundColor: '#f9fafb', borderRadius: '6px', padding: '0.75rem',
        marginBlockEnd: '1.25rem', fontSize: '0.875rem', color: '#6b7280',
      }}>
        <div>{t('fastEntryTimestampLabel')} <strong>{new Date().toLocaleTimeString()}</strong> {t('fastEntryTimestampAuto')}</div>
        <div>{t('fastEntryTechIdLabel')} <strong>{session?.practitionerId ?? '—'}</strong> {t('fastEntryTechIdSession')}</div>
      </div>

      {error && (
        <p role="alert" style={{ color: '#dc2626', marginBlockEnd: '1rem', fontSize: '0.875rem' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !sampleId.trim() || !result}
        style={{
          width: '100%',
          padding: '0.875rem',
          fontSize: '1rem',
          fontWeight: 700,
          borderRadius: '6px',
          backgroundColor: submitting || !sampleId.trim() || !result ? '#d1d5db' : '#dc2626',
          color: '#fff',
          border: 'none',
          cursor: submitting || !sampleId.trim() || !result ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? t('fastEntrySubmittingButton') : t('fastEntrySubmitButton')}
      </button>
    </div>
  )
}
