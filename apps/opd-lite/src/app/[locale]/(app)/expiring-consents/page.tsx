'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

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
 *
 * TODO i18n: add keys under "consent" namespace for all hardcoded strings.
 */
export default function ExpiringConsentsPage() {
  const [consents, setConsents] = useState<ExpiringConsent[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const loadConsents = useCallback(async () => {
    setLoading(true)
    try {
      const hubUrl =
        process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
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
      // Network unavailable — keep empty list
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

  return (
    <div className="flex flex-col gap-4">

        {loading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}

        {!loading && consents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No consents expiring within 90 days.
          </p>
        )}

        {!loading && consents.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">Patient ID</th>
                    <th className="px-4 py-3 text-start font-semibold">Expiry Date</th>
                    <th className="px-4 py-3 text-start font-semibold">Days Until Expiry</th>
                    <th className="px-4 py-3 text-start font-semibold">Version</th>
                    <th className="px-4 py-3 text-start font-semibold">Grantor Role</th>
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
                          {new Date(c.provision_end).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              days <= 30
                                ? 'font-semibold text-destructive'
                                : days <= 60
                                  ? 'font-semibold text-warning'
                                  : 'text-foreground'
                            }
                          >
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
                Previous
              </Button>
              <Button variant="outline" disabled={consents.length < limit} onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            </div>
          </>
        )}
    </div>
  )
}
