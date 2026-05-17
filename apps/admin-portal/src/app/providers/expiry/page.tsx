'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { RenewLicenseModal } from '@/components/providers/RenewLicenseModal'

type ExpiryWindow = '7d' | '30d' | '60d' | 'all'

interface ExpiringProvider {
  practitionerId: string
  name: string
  licenseNumber: string
  issuingBody: string
  expiryDate: string
  daysRemaining: number | null
  kycStatus: string
}

const PAGE_SIZE = 25

function getUrgencyBadge(daysRemaining: number | null): {
  label: string
  className: string
} {
  if (daysRemaining === null) return { label: 'Unknown', className: 'bg-neutral-100 text-neutral-600' }
  if (daysRemaining <= 0) return { label: 'Expired', className: 'bg-red-100 text-red-800 font-semibold' }
  if (daysRemaining <= 7) return { label: `${daysRemaining}d`, className: 'bg-red-100 text-red-800 font-semibold' }
  if (daysRemaining <= 30) return { label: `${daysRemaining}d`, className: 'bg-orange-100 text-orange-800' }
  if (daysRemaining <= 60) return { label: `${daysRemaining}d`, className: 'bg-yellow-100 text-yellow-800' }
  return { label: `${daysRemaining}d`, className: 'bg-neutral-100 text-neutral-600' }
}

export default function LicenseExpiryPage() {
  const mounted = useRef(true)
  const [providers, setProviders] = useState<ExpiringProvider[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renewTarget, setRenewTarget] = useState<ExpiringProvider | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetchData = useCallback(async (windowFilter: ExpiryWindow, page: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await trpc.admin.listExpiringProviders.query({
        window: windowFilter,
        cursor: page,
        limit: PAGE_SIZE,
      })
      if (!mounted.current) return
      setProviders(result.providers)
      setTotal(result.total)
    } catch {
      if (!mounted.current) return
      setError('Failed to load expiring providers')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(expiryWindow, cursor)
  }, [fetchData, expiryWindow, cursor])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">License Expiry</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Providers approaching license expiry, sorted by urgency
          </p>
        </div>
        <div className="flex gap-2">
          {(['all', '60d', '30d', '7d'] as const).map((w) => (
            <button
              key={w}
              onClick={() => { setExpiryWindow(w); setCursor(0) }}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                expiryWindow === w
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {w === 'all' ? 'All' : `≤ ${w.replace('d', '')} days`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-start px-4 py-3 font-medium text-neutral-600">Provider Name</th>
              <th className="text-start px-4 py-3 font-medium text-neutral-600">License Number</th>
              <th className="text-start px-4 py-3 font-medium text-neutral-600">Issuing Body</th>
              <th className="text-start px-4 py-3 font-medium text-neutral-600">Expiry Date</th>
              <th className="text-start px-4 py-3 font-medium text-neutral-600">Days Remaining</th>
              <th className="text-start px-4 py-3 font-medium text-neutral-600">KYC Status</th>
              <th className="text-start px-4 py-3 font-medium text-neutral-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  Loading...
                </td>
              </tr>
            ) : providers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No providers found for the selected filter
                </td>
              </tr>
            ) : (
              providers.map((p) => {
                const badge = getUrgencyBadge(p.daysRemaining)
                return (
                  <tr
                    key={p.practitionerId}
                    className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                    onClick={() => setRenewTarget(p)}
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900">{p.name}</td>
                    <td className="px-4 py-3 text-neutral-600">{p.licenseNumber}</td>
                    <td className="px-4 py-3 text-neutral-600">{p.issuingBody}</td>
                    <td className="px-4 py-3 text-neutral-600">{p.expiryDate}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                        p.kycStatus === 'ACTIVE' ? 'bg-green-100 text-green-800'
                          : p.kycStatus === 'SUSPENDED' ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {p.kycStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenewTarget(p) }}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Renew
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
            <span className="text-sm text-neutral-600">
              Page {currentPage} of {totalPages} ({total} providers)
            </span>
            <div className="flex gap-2">
              <button
                disabled={cursor === 0}
                onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                className="px-3 py-1 text-sm rounded border border-neutral-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCursor(cursor + PAGE_SIZE)}
                className="px-3 py-1 text-sm rounded border border-neutral-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {renewTarget && (
        <RenewLicenseModal
          provider={renewTarget}
          onClose={() => setRenewTarget(null)}
          onRenewed={() => {
            setRenewTarget(null)
            fetchData(expiryWindow, cursor)
          }}
        />
      )}
    </div>
  )
}
