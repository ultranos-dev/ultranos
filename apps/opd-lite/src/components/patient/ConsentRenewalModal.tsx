'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface ConsentRenewalModalProps {
  patientId: string
  onClose: () => void
  onRenewed: () => void
}

/**
 * Modal form for renewing a patient's consent.
 * Calls the Hub API consent.renew mutation on submit.
 *
 * TODO i18n: add keys under "consent" namespace:
 *   renewTitle, methodLabel, methodWritten, methodVerbal, witnessLabel,
 *   languageLabel, versionLabel, submitRenew, cancel, renewSuccess, renewError
 */
export function ConsentRenewalModal({ patientId, onClose, onRenewed }: ConsentRenewalModalProps) {
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
      const hubUrl =
        process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'

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
      setError('Failed to renew consent. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="rounded-xl bg-background p-6 max-w-md w-full shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-renewal-title"
      >
        <h2 id="consent-renewal-title" className="text-lg font-bold text-foreground mb-4">
          {/* TODO: t('consent.renewTitle') */}
          Renew Patient Consent
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Method */}
          <div>
            <label htmlFor="consent-method" className="block text-sm font-medium text-foreground mb-1">
              {/* TODO: t('consent.methodLabel') */}
              Method
            </label>
            <select
              id="consent-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as 'WRITTEN' | 'VERBAL_WITNESSED')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
            >
              <option value="WRITTEN">Written</option>
              <option value="VERBAL_WITNESSED">Verbal (Witnessed)</option>
            </select>
          </div>

          {/* Witness (required if verbal) */}
          {method === 'VERBAL_WITNESSED' && (
            <div>
              <label htmlFor="consent-witness" className="block text-sm font-medium text-foreground mb-1">
                {/* TODO: t('consent.witnessLabel') */}
                Witness ID
              </label>
              <input
                id="consent-witness"
                type="text"
                required
                value={witnessedBy}
                onChange={(e) => setWitnessedBy(e.target.value)}
                placeholder="UUID of witnessing practitioner"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
              />
            </div>
          )}

          {/* Language */}
          <div>
            <label htmlFor="consent-language" className="block text-sm font-medium text-foreground mb-1">
              {/* TODO: t('consent.languageLabel') */}
              Language
            </label>
            <select
              id="consent-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'ar' | 'prs')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="prs">Dari</option>
            </select>
          </div>

          {/* Version */}
          <div>
            <label htmlFor="consent-version" className="block text-sm font-medium text-foreground mb-1">
              {/* TODO: t('consent.versionLabel') */}
              Version
            </label>
            <input
              id="consent-version"
              type="text"
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 2.0"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-warning focus:outline-none focus:ring-1 focus:ring-warning"
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
              {/* TODO: t('consent.cancel') */}
              Cancel
            </Button>
            <Button
              variant="warning"
              type="submit"
              disabled={submitting || !version.trim()}
            >
              {submitting ? 'Renewing...' : 'Renew Consent'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
