'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import { SOPCategory, type SOP } from '@/lib/sop-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Category tabs */}
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label={t('categoryFilter')}>
        <button
          role="tab"
          aria-selected={selectedCategory === 'ALL'}
          onClick={() => setSelectedCategory('ALL')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selectedCategory === 'ALL'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {t('allCategories')}
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          {t('loading')}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredSOPs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <p>{searchQuery ? t('noSearchResults') : t('empty')}</p>
        </div>
      )}

      {/* SOP cards */}
      {!loading && filteredSOPs.length > 0 && (
        <div className="space-y-3" role="tabpanel">
          {filteredSOPs.map((sop) => {
            const isAcked = acknowledgedSet.has(`${sop.id}:${sop.version}`)
            return (
              <button
                key={sop.id}
                onClick={() => setSelectedSOP(sop)}
                className="w-full rounded-lg border border-gray-200 bg-white p-4 text-start shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-750"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {sop.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-medium dark:bg-gray-700">
                        {categoryLabel(sop.category)}
                      </span>
                      <span>v{sop.version}</span>
                      <span>{new Date(sop.effectiveDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isAcked ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                        {t('acknowledged')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        {t('unacknowledged')}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
