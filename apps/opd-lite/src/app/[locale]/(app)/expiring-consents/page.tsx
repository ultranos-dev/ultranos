'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { CalendarClock } from '@ultranos/ui-kit/icons'
import { getHubTrpcUrl } from '@/lib/hub-url'

interface ExpiringConsent {
  id: string
  patient_ref: string
  provision_end: string
  consent_version: string
  grantor_role: string
}

/**
 * Expiring Consents page — lists active consents expiring within 90 days.
 * Fetches from the Hub API consent.expiringSoon endpoint.
 */
export default function ExpiringConsentsPage() {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const t = useTranslations('consent')
  const [consents, setConsents] = useState<ExpiringConsent[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const loadConsents = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const hubUrl = getHubTrpcUrl()
      const input = JSON.stringify({ json: { limit, offset } })
      const res = await fetch(
        `${hubUrl}/consent.expiringSoon?input=${encodeURIComponent(input)}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      )

      if (!res.ok) throw new Error(`Hub API error: ${res.status}`)

      const body = (await res.json()) as {
        result: { data: { json: { consents: ExpiringConsent[] } } }
      }
      setConsents(body.result.data.json.consents)
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => {
    loadConsents()
  }, [loadConsents])

  function extractPatientId(ref: string): string {
    return ref.replace('Patient/', '')
  }

  function daysUntilExpiry(provisionEnd: string): number {
    const now = Date.now()
    const end = new Date(provisionEnd).getTime()
    return Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)))
  }

  function expiryPillClass(days: number): string {
    if (days <= 30) return 'inline-flex rounded-full px-2 py-0.5 text-xs font-bold bg-destructive/20 text-destructive'
    if (days <= 60) return 'inline-flex rounded-full px-2 py-0.5 text-xs font-bold bg-warning/20 text-warning'
    return 'inline-flex rounded-full px-2 py-0.5 text-xs font-bold bg-muted text-muted-foreground'
  }

  return (
    <div className="flex flex-col gap-4">

        {loading && (
          <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{t('colPatientId')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colExpiryDate')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colDaysUntilExpiry')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colVersion')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t('colGrantorRole')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && fetchError && (
          <Alert variant="destructive" role="alert">
            {t('fetchError')}
          </Alert>
        )}

        {!loading && !fetchError && consents.length === 0 && (
          <EmptyState
            icon={CalendarClock}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        )}

        {!loading && !fetchError && consents.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">{t('colPatientId')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('colExpiryDate')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('colDaysUntilExpiry')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('colVersion')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('colGrantorRole')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {consents.map((c) => {
                    const days = daysUntilExpiry(c.provision_end)
                    return (
                      <tr key={c.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-mono text-xs">
                          {extractPatientId(c.patient_ref)}
                        </td>
                        <td className="px-4 py-3">
                          {formatDate(c.provision_end, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={expiryPillClass(days)}>
                            {days}
                          </span>
                        </td>
                        <td className="px-4 py-3">{c.consent_version}</td>
                        <td className="px-4 py-3">{c.grantor_role}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                {t('previous')}
              </Button>
              <Button variant="outline" disabled={consents.length < limit} onClick={() => setOffset(offset + limit)}>
                {t('next')}
              </Button>
            </div>
          </>
        )}
    </div>
  )
}
