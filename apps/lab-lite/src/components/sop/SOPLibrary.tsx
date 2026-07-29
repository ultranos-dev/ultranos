'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { SOPCategory, type SOP } from '@/lib/sop-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { BookOpen, FileSearch } from '@ultranos/ui-kit/icons'
import { Badge } from '@/components/ui/badge'
import { SOPDetailView } from './SOPDetailView'

const CATEGORY_ORDER: SOPCategory[] = [
  SOPCategory.HEMATOLOGY,
  SOPCategory.CHEMISTRY,
  SOPCategory.MICROBIOLOGY,
  SOPCategory.GENERAL_LAB_SAFETY,
  SOPCategory.OTHER,
]

export function SOPLibrary() {
  const t = useTranslations('sop')
  const session = useAuthSessionStore((s) => s.session)
  const technicianId = session?.userId ?? session?.email ?? ''

  const [sops, setSOPs] = useState<SOP[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<SOPCategory | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSOP, setSelectedSOP] = useState<SOP | null>(null)
  const [acknowledgedSet, setAcknowledgedSet] = useState<Set<string>>(new Set())

  const loadSOPs = useCallback(async () => {
    try {
      const db = getDb()
      const allActive = await db.sops.where('status').equals('active').toArray()
      setSOPs(allActive)

      if (technicianId) {
        const acks = await db.sop_acknowledgments
          .where('technicianId')
          .equals(technicianId)
          .toArray()
        setAcknowledgedSet(new Set(acks.map((a) => `${a.sopId}:${a.sopVersion}`)))
      }
    } catch {
      // Dexie unavailable
    } finally {
      setLoading(false)
    }
  }, [technicianId])

  useEffect(() => {
    loadSOPs()
  }, [loadSOPs])

  const filteredSOPs = useMemo(() => {
    let result = sops

    if (selectedCategory !== 'ALL') {
      result = result.filter((s) => s.category === selectedCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q),
      )
    }

    // Sort by effective date (newest first)
    return result.sort(
      (a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime(),
    )
  }, [sops, selectedCategory, searchQuery])

  const handleAcknowledged = useCallback(() => {
    loadSOPs()
  }, [loadSOPs])

  if (selectedSOP) {
    return (
      <SOPDetailView
        sop={selectedSOP}
        technicianId={technicianId}
        isAcknowledged={acknowledgedSet.has(`${selectedSOP.id}:${selectedSOP.version}`)}
        onBack={() => setSelectedSOP(null)}
        onAcknowledged={handleAcknowledged}
      />
    )
  }

  const categoryLabel = (cat: SOPCategory): string => {
    const key = `category.${cat}` as const
    return t(key)
  }

  const filtersActive = selectedCategory !== 'ALL' || searchQuery.trim() !== ''

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: search + category filter — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="min-w-[200px] flex-1"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as SOPCategory | 'ALL')}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('categoryFilter')}
        >
          <option value="ALL">{t('allCategories')}</option>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>{categoryLabel(cat)}</option>
          ))}
        </select>
      </div>

      {/* Content box — single cohesive box (loading / empty / list) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('loading')}
          </div>
        ) : filteredSOPs.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : BookOpen}
              title={filtersActive ? t('noSearchResults') : t('empty')}
              action={filtersActive ? { label: t('clearFilters'), onClick: () => { setSearchQuery(''); setSelectedCategory('ALL') } } : undefined}
            />
          </div>
        ) : (
          <div className="divide-y divide-border" role="list">
            {filteredSOPs.map((sop) => {
              const isAcked = acknowledgedSet.has(`${sop.id}:${sop.version}`)
              return (
                <button
                  key={sop.id}
                  onClick={() => setSelectedSOP(sop)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground">{sop.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-2 py-0.5 font-medium">
                        {categoryLabel(sop.category)}
                      </span>
                      <span>v{sop.version}</span>
                      <span>{new Date(sop.effectiveDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant={isAcked ? 'success' : 'warning'}>
                      {isAcked ? t('acknowledged') : t('unacknowledged')}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
