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
          <h1 className="text-4xl font-bold text-black tracking-tight wavy-divider">License Expiry</h1>
          <p className="text-sm text-text-muted mt-4">
            Providers approaching license expiry, sorted by urgency
          </p>
        </div>
        <div className="flex gap-2">
          {(['all', '60d', '30d', '7d'] as const).map((w) => (
            <button
              key={w}
              onClick={() => { setExpiryWindow(w); setCursor(0) }}
              className={`px-4 py-1.5 text-sm rounded-full border transition-all ${
                expiryWindow === w
                  ? 'bg-brand-lime text-black border-brand-lime'
                  : 'bg-white text-black border-black hover:bg-neutral-50 hover:scale-[1.02]'
              }`}
            >
              {w === 'all' ? 'All' : `≤ ${w.replace('d', '')} days`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-2xl mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black">
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">Provider Name</th>
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">License Number</th>
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">Issuing Body</th>
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">Expiry Date</th>
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">Days Remaining</th>
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">KYC Status</th>
              <th className="text-start px-4 py-3 font-medium text-white text-xs uppercase tracking-wider">Action</th>
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
                    className="border-b border-border hover:bg-brand-lime/5 cursor-pointer transition-colors"
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
                        className="text-sm text-black hover:text-brand-lime font-medium transition-colors"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
            <span className="text-sm text-neutral-600">
              Page {currentPage} of {totalPages} ({total} providers)
            </span>
            <div className="flex gap-2">
              <button
                disabled={cursor === 0}
                onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
                className="px-4 py-1.5 text-sm rounded-full border border-black bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 hover:scale-[1.02] transition-all"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCursor(cursor + PAGE_SIZE)}
                className="px-4 py-1.5 text-sm rounded-full border border-black bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 hover:scale-[1.02] transition-all"
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
