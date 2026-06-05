'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X, Send, ExternalLink } from '@ultranos/ui-kit/icons'
import { getLabsForTest } from '@/lib/reference-lab-config'
import { initiateSendOut } from '@/lib/sendout-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { ReferenceLab, CreateSendOutInput } from '@/types/reference-lab'

interface SendOutModalProps {
  sampleId: string
  loincCode: string
  loincDisplay: string
  sampleType: string
  onClose: () => void
  onSuccess: (sendOutId: string) => void
}

export function SendOutModal({
  sampleId,
  loincCode,
  loincDisplay,
  sampleType,
  onClose,
  onSuccess,
}: SendOutModalProps) {
  const t = useTranslations('sendout')
  const session = useAuthSessionStore((s) => s.session)
  const [labs, setLabs] = useState<ReferenceLab[]>([])
  const [selectedLabId, setSelectedLabId] = useState('')
  const [clinicalContext, setClinicalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    getLabsForTest(loincCode).then(setLabs).catch(() => setLabs([]))
  }, [loincCode])

  const selectedLab = labs.find((l) => l.id === selectedLabId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLabId || !session?.userId) return
    setLoading(true)
    setError(null)
    try {
      const input: CreateSendOutInput = {
        sampleId,
        referenceLabId: selectedLabId,
        testRequested: { loincCode, loincDisplay },
        clinicalContext,
      }
      const sendOut = await initiateSendOut(input, session.userId)
      onSuccess(sendOut.id)
    } catch {
      setError(t('sendOutError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sendout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="sendout-modal-title" className="text-base font-semibold text-foreground">
            {t('sendOutModalTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
            aria-label={t('sendOutCloseAriaLabel')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Test info (read-only) */}
          <div className="rounded-md bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground">{t('sendOutTestRequestedLabel')}</p>
            <p className="font-medium text-foreground">{loincDisplay}</p>
            <p className="text-xs text-muted-foreground">{loincCode} · {sampleType}</p>
          </div>

          {/* Reference Lab selector */}
          <div>
            <label htmlFor="reflab-select" className="block text-sm font-medium text-foreground mb-1">
              {t('sendOutReferenceLabLabel')} <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            {labs.length === 0 ? (
              <p className="text-sm text-amber-600">
                {t('sendOutNoLabsConfigured')}
              </p>
            ) : (
              <select
                id="reflab-select"
                value={selectedLabId}
                onChange={(e) => setSelectedLabId(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t('sendOutSelectLabPlaceholder')}</option>
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name} — {t('sendOutAvgTat', { tat: lab.averageTATDays[loincCode] ?? '?' })}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Clinical context */}
          <div>
            <label htmlFor="clinical-context" className="block text-sm font-medium text-foreground mb-1">
              {t('sendOutClinicalContextLabel')}
            </label>
            <textarea
              id="clinical-context"
              value={clinicalContext}
              onChange={(e) => setClinicalContext(e.target.value)}
              rows={3}
              placeholder={t('sendOutClinicalContextPlaceholder')}
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t('sendOutClinicalContextHint')}
            </p>
          </div>

          {/* Referral form preview */}
          {selectedLab && (
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="text-sm text-blue-600 underline"
            >
              {showPreview ? t('sendOutPreviewHide') : t('sendOutPreviewShow')}
            </button>
          )}

          {showPreview && selectedLab && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm space-y-1">
              <p className="font-medium text-blue-900">{t('sendOutPreviewTitle')}</p>
              <p><span className="text-blue-700">{t('sendOutPreviewPatient')}</span> {t('sendOutPreviewPatientValue')}</p>
              <p><span className="text-blue-700">{t('sendOutPreviewSampleType')}</span> {sampleType}</p>
              <p><span className="text-blue-700">{t('sendOutPreviewTest')}</span> {loincDisplay} ({loincCode})</p>
              <p><span className="text-blue-700">{t('sendOutPreviewContext')}</span> {clinicalContext || '—'}</p>
              <p><span className="text-blue-700">{t('sendOutPreviewLab')}</span> {selectedLab.name} ({t('sendOutPreviewAccredNumber', { number: selectedLab.accreditationNumber })})</p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30"
            >
              {t('sendOutCancelButton')}
            </button>
            <button
              type="submit"
              disabled={loading || !selectedLabId}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={16} />
              {loading ? t('sendOutSendingButton') : t('sendOutConfirmButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
