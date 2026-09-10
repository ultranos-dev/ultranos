'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { listPrescriptionsForPatient, type PharmacyPrescriptionItem } from '@/lib/trpc'

/**
 * No-QR prescription lookup (Gap #4). The pharmacist identifies the patient
 * (Health Passport identity QR `pid` or national-ID lookup) and pulls their
 * un-dispensed prescriptions from the Hub — the fallback when a patient arrives
 * without a printed prescription QR, or for a repeat fill. Read-only display;
 * the signed-QR path remains the offline-primary dispensing channel.
 */
export function PrescriptionLookupView() {
  const t = useTranslations('rxLookup')
  const [patientId, setPatientId] = useState('')
  const [results, setResults] = useState<PharmacyPrescriptionItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLookup = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const id = patientId.trim()
      if (!id || isLoading) return
      setIsLoading(true)
      setError(null)
      setResults(null)
      try {
        const found = await listPrescriptionsForPatient(id)
        setResults(found)
      } catch {
        setError(t('errorLookup'))
      } finally {
        setIsLoading(false)
      }
    },
    [patientId, isLoading, t],
  )

  const inputClasses =
    'w-full rounded-xl border border-border bg-background ps-4 pe-4 py-2.5 ' +
    'text-base text-foreground placeholder:text-muted-foreground ' +
    'transition-colors focus:outline-none focus:ring-2 focus:border-primary focus:ring-ring'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="rx-lookup-patient" className="mb-1 block text-sm font-semibold text-foreground">
            {t('patientIdLabel')}
          </label>
          <input
            id="rx-lookup-patient"
            type="text"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder={t('patientIdPlaceholder')}
            className={inputClasses}
            aria-label={t('patientIdLabel')}
          />
        </div>
        <Button variant="default" type="submit" disabled={isLoading || !patientId.trim()}>
          {isLoading ? t('searching') : t('lookup')}
        </Button>
      </form>

      {error && (
        <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>
      )}

      {results && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {results.length === 0 ? (
            <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
              {t('noResults')}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colMedication')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colOrderedOn')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((rx) => (
                  <tr key={rx.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm text-foreground" dir="auto">
                      {rx.medicationText ?? rx.medicationDisplay ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {rx.prescriptionStatus ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {rx.authoredOn ? rx.authoredOn.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
