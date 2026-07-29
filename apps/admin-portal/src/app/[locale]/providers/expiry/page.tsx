'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { RenewLicenseModal } from '@/components/providers/RenewLicenseModal'
import { ExportButton } from '@/components/ExportButton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Award, FileSearch } from '@ultranos/ui-kit/icons'

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
  variant: 'secondary' | 'destructive' | 'warning'
} {
  if (daysRemaining === null) return { label: 'Unknown', variant: 'secondary' }
  if (daysRemaining <= 0) return { label: 'Expired', variant: 'destructive' }
  if (daysRemaining <= 7) return { label: `${daysRemaining}d`, variant: 'destructive' }
  if (daysRemaining <= 30) return { label: `${daysRemaining}d`, variant: 'warning' }
  if (daysRemaining <= 60) return { label: `${daysRemaining}d`, variant: 'warning' }
  return { label: `${daysRemaining}d`, variant: 'secondary' }
}

export default function LicenseExpiryPage() {
  const t = useTranslations('providers')
  const mounted = useRef(true)
  const [providers, setProviders] = useState<ExpiringProvider[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [expiryWindow, setExpiryWindow] = useState<ExpiryWindow>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renewTarget, setRenewTarget] = useState<ExpiringProvider | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetchData = useCallback(async (windowFilter: ExpiryWindow, page: number, searchTerm: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await trpc.admin.listExpiringProviders.query({
        window: windowFilter,
        cursor: page,
        limit: PAGE_SIZE,
        search: searchTerm || undefined,
      })
      if (!mounted.current) return
      setProviders(result.providers)
      setTotal(result.total)
    } catch {
      if (!mounted.current) return
      setError(t('expiryErrorLoad'))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(expiryWindow, cursor, search)
  }, [fetchData, expiryWindow, cursor, search])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(cursor / PAGE_SIZE) + 1

  const filtersActive = search.trim() !== '' || expiryWindow !== 'all'

  return (
    <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('expiryPageTitle')}</h1>

        {/* Toolbar: window tabs + search + export — one row, always visible */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {(['all', '60d', '30d', '7d'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => { setExpiryWindow(w); setCursor(0) }}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  expiryWindow === w
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={expiryWindow === w}
              >
                {w === 'all' ? t('expiryFilterAll') : w === '7d' ? t('expiryFilter7d') : w === '30d' ? t('expiryFilter30d') : t('expiryFilter60d')}
              </button>
            ))}
          </div>
          <Input
            type="text"
            dir="auto"
            placeholder={t('expirySearchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCursor(0) }}
            className="min-w-[200px] flex-1"
            aria-label={t('expirySearchPlaceholder')}
          />
          <ExportButton exportFn={() => trpc.admin.exportExpiringProviders.query()} filters={{}} />
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Content panel — single cohesive box */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('expiryLoadingProviders')}</div>
          ) : providers.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={filtersActive ? FileSearch : Award}
                title={filtersActive ? t('noResultsTitle') : t('expiryNoProviders')}
                description={filtersActive ? t('noResultsDescription') : t('expiryNoProvidersDescription')}
                action={filtersActive ? { label: t('clearFilters'), onClick: () => { setSearch(''); setExpiryWindow('all'); setCursor(0) } } : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColProvider')}</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColLicense')}</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColIssuingBody')}</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColExpiryDate')}</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColDaysRemaining')}</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColKycStatus')}</th>
                    <th className="text-start px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('expiryColAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {providers.map((p) => {
                  const badge = getUrgencyBadge(p.daysRemaining)
                  return (
                    <tr
                      key={p.practitionerId}
                      className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setRenewTarget(p)}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link
                          href={`/providers/profile/${p.practitionerId}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.licenseNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.issuingBody}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.expiryDate}</td>
                      <td className="px-4 py-3">
                        <Badge variant={badge.variant}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          p.kycStatus === 'ACTIVE' ? 'success'
                            : p.kycStatus === 'SUSPENDED' ? 'destructive'
                            : 'warning'
                        }>
                          {p.kycStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setRenewTarget(p) }}
                        >
                          {t('expiryRenew')}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination — below the content box */}
        {!loading && providers.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {currentPage} of {totalPages} ({total} providers)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cursor === 0}
                onClick={() => setCursor(Math.max(0, cursor - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCursor(cursor + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <RenewLicenseModal
          provider={renewTarget ?? { practitionerId: '', name: '', licenseNumber: '', kycStatus: '', expiryDate: '', daysRemaining: null }}
          open={renewTarget !== null}
          onOpenChange={(open) => { if (!open) setRenewTarget(null) }}
          onRenewed={() => {
            setRenewTarget(null)
            fetchData(expiryWindow, cursor, search)
          }}
        />
      </div>
  )
}
