'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  ModalHeader,
} from '@ultranos/ui-kit/components/ui/dialog'
import { getHubTrpcUrl } from '@/lib/hub-url'

interface ConsentRenewalModalProps {
  patientId: string
  onClose: () => void
  onRenewed: () => void
}

/**
 * Modal form for renewing a patient's consent.
 * Calls the Hub API consent.renew mutation on submit.
 *
 * Story 63.1: fully keyed under the "consent" namespace and rebuilt on the
 * shared ui-kit radix `Dialog` (was a hand-rolled `fixed inset-0` overlay).
 * Behavior-identical — same fields, validation, and submit path. The banner
 * mounts this only when open, so `open` is always true here; closing routes
 * through `onClose` (X button, Escape, overlay click, or Cancel).
 */
export function ConsentRenewalModal({ patientId, onClose, onRenewed }: ConsentRenewalModalProps) {
  const t = useTranslations('consent')
  const [method, setMethod] = useState<'WRITTEN' | 'VERBAL_WITNESSED'>('WRITTEN')
  const [witnessedBy, setWitnessedBy] = useState('')
  const [language, setLanguage] = useState<'en' | 'ar' | 'prs'>('en')
  const [version, setVersion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const hubUrl = getHubTrpcUrl()

      const payload: Record<string, unknown> = {
        patientId,
        method,
        language,
        version,
      }
      if (method === 'VERBAL_WITNESSED' && witnessedBy.trim()) {
        payload.witnessedBy = witnessedBy.trim()
      }

      const res = await fetch(`${hubUrl}/consent.renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: payload }),
      })

      if (!res.ok) {
        throw new Error(`Hub API error: ${res.status}`)
      }

      onRenewed()
      onClose()
    } catch {
      setError(t('renewError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" hideClose>
        <ModalHeader
          title={t('renewTitle')}
          titleId="consent-renewal-title"
          closeLabel={t('close')}
          dialog
          inset
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Method */}
          <div>
            <label htmlFor="consent-method" className="block text-sm font-medium text-foreground mb-1">
              {t('methodLabel')}
            </label>
            <select
              id="consent-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as 'WRITTEN' | 'VERBAL_WITNESSED')}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
            >
              <option value="WRITTEN">{t('methodWritten')}</option>
              <option value="VERBAL_WITNESSED">{t('methodVerbal')}</option>
            </select>
          </div>

          {/* Witness (required if verbal) */}
          {method === 'VERBAL_WITNESSED' && (
            <div>
              <label htmlFor="consent-witness" className="block text-sm font-medium text-foreground mb-1">
                {t('witnessLabel')}
              </label>
              <input
                id="consent-witness"
                type="text"
                required
                value={witnessedBy}
                onChange={(e) => setWitnessedBy(e.target.value)}
                placeholder={t('witnessPlaceholder')}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
              />
            </div>
          )}

          {/* Language */}
          <div>
            <label htmlFor="consent-language" className="block text-sm font-medium text-foreground mb-1">
              {t('languageLabel')}
            </label>
            <select
              id="consent-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'ar' | 'prs')}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
            >
              <option value="en">{t('languageEnglish')}</option>
              <option value="ar">{t('languageArabic')}</option>
              <option value="prs">{t('languageDari')}</option>
            </select>
          </div>

          {/* Version */}
          <div>
            <label htmlFor="consent-version" className="block text-sm font-medium text-foreground mb-1">
              {t('versionLabel')}
            </label>
            <input
              id="consent-version"
              type="text"
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder={t('versionPlaceholder')}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="warning"
              type="submit"
              disabled={submitting || !version.trim()}
            >
              {submitting ? t('renewing') : t('renewConsent')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
