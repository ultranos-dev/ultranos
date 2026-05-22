'use client'

import { useCallback, useEffect, useState } from 'react'

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
        process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
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
    <main id="main-content" className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">
        {/* TODO: t('consent.expiringConsentsTitle') */}
        Expiring Consents
      </h1>

      {loading && (
        <p className="text-sm text-neutral-500">Loading...</p>
      )}

      {!loading && consents.length === 0 && (
        <p className="text-sm text-neutral-500">
          {/* TODO: t('consent.noExpiringConsents') */}
          No consents expiring within 90 days.
        </p>
      )}

      {!loading && consents.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">Patient ID</th>
                  <th className="px-4 py-3 text-start font-semibold">Expiry Date</th>
                  <th className="px-4 py-3 text-start font-semibold">Days Until Expiry</th>
                  <th className="px-4 py-3 text-start font-semibold">Version</th>
                  <th className="px-4 py-3 text-start font-semibold">Grantor Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {consents.map((c) => {
                  const days = daysUntilExpiry(c.provision_end)
                  return (
                    <tr key={c.id} className="hover:bg-neutral-50">
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
                              ? 'font-semibold text-red-600'
                              : days <= 60
                              ? 'font-semibold text-amber-600'
                              : 'text-neutral-700'
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
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={consents.length < limit}
              onClick={() => setOffset(offset + limit)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  )
}
