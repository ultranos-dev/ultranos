'use client'

/**
 * AtlasBrowser — Visual Atlas for Microscopy (Story 53.2)
 *
 * Offline-capable physician-curated reference browser.
 * No PHI — atlas content is independent of patient data.
 * RTL-compatible: all layout uses logical CSS properties.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { getDb, seedAtlas } from '@/lib/db'
import type { AtlasEntry, AtlasCategory, AtlasSubcategory } from '@/lib/visual-atlas'
import { ATLAS_CATEGORY_TREE } from '@/lib/visual-atlas'
import { searchAtlas } from '@/lib/atlas-search'
import { reportAtlasView } from '@/lib/audit-client'
import {
  Microscope,
  Droplet,
  FlaskConical,
  Beaker,
  Activity,
  ChevronRight,
  ChevronDown,
  Search,
  ArrowLeft,
  CircleX,
} from '@ultranos/ui-kit/icons'

// Medical icons must NOT mirror in RTL. Chevrons DO mirror (directional).
function categoryIcon(icon: string) {
  switch (icon) {
    case 'droplet': return <Droplet size={16} aria-hidden="true" />
    case 'flask': return <FlaskConical size={16} aria-hidden="true" />
    case 'beaker': return <Beaker size={16} aria-hidden="true" />
    case 'activity': return <Activity size={16} aria-hidden="true" />
    default: return <Microscope size={16} aria-hidden="true" />
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SearchResult extends AtlasEntry {
  _categoryName: string
  _subcategoryName: string
}

// ---------------------------------------------------------------------------
// AtlasBrowser
// ---------------------------------------------------------------------------
export function AtlasBrowser() {
  const t = useTranslations('visualAtlas')
  const pathname = usePathname()

  // Pre-navigation: if coming from /results/*, default to blood-cells
  const defaultCategoryId = pathname?.includes('/results') ? 'blood-cells' : null

  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<AtlasEntry[]>([])
  const [categories, setCategories] = useState<AtlasCategory[]>([])

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(defaultCategoryId ? [defaultCategoryId] : []),
  )
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<AtlasEntry | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Load from Dexie (seed first-time if needed)
  // ---------------------------------------------------------------------------
  const load = useCallback(async () => {
    try {
      await seedAtlas()
      const db = getDb()
      const [storedEntries, storedCategories] = await Promise.all([
        db.atlas_entries.toArray(),
        db.atlas_categories.toArray(),
      ])

      if (storedEntries.length > 0) {
        setEntries(storedEntries)
        // Hydrate ATLAS_CATEGORY_TREE with stored entries
        const enriched = ATLAS_CATEGORY_TREE.map((cat) => ({
          ...cat,
          subcategories: cat.subcategories.map((sub) => ({
            ...sub,
            entries: storedEntries.filter((e) => e.subcategoryId === sub.id),
          })),
        }))
        setCategories(enriched)
      } else {
        // Fallback to in-memory seed data if Dexie is unavailable
        const { ALL_SEED_ENTRIES_BY_SUBCATEGORY } = await import('@/lib/atlas-seed-data')
        const enriched = ATLAS_CATEGORY_TREE.map((cat) => ({
          ...cat,
          subcategories: cat.subcategories.map((sub) => ({
            ...sub,
            entries: ALL_SEED_ENTRIES_BY_SUBCATEGORY[sub.id] ?? [],
          })),
        }))
        setCategories(enriched)
        setEntries(Object.values(ALL_SEED_ENTRIES_BY_SUBCATEGORY).flat())
      }

      // Auto-select first subcategory if coming from results context
      if (defaultCategoryId && storedCategories.length > 0) {
        const defaultCat = ATLAS_CATEGORY_TREE.find((c) => c.id === defaultCategoryId)
        if (defaultCat?.subcategories?.[0]) {
          setSelectedSubcategoryId(defaultCat.subcategories[0].id)
        }
      }
    } catch {
      // Dexie unavailable — silent fail, UI shows loading state
    } finally {
      setLoading(false)
    }
  }, [defaultCategoryId])

  useEffect(() => {
    load()
  }, [load])

  // ---------------------------------------------------------------------------
  // Debounced search (300ms)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    searchDebounceRef.current = setTimeout(() => {
      const raw = searchAtlas(entries, searchQuery)
      // Enrich with category/subcategory names for grouping display
      const enriched: SearchResult[] = raw.map((entry) => {
        const cat = categories.find((c) => c.id === entry.categoryId)
        const sub = cat?.subcategories.find((s) => s.id === entry.subcategoryId)
        return {
          ...entry,
          _categoryName: cat ? t(cat.name) : entry.categoryId,
          _subcategoryName: sub ? t(sub.name) : entry.subcategoryId,
        }
      })
      setSearchResults(enriched)
    }, 300)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery, entries, categories, t])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function toggleCategory(categoryId: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  function selectSubcategory(sub: AtlasSubcategory) {
    setSelectedSubcategoryId(sub.id)
    setSelectedEntry(null)
    setSearchQuery('')
    setSearchResults(null)
  }

  function selectEntry(entry: AtlasEntry) {
    setSelectedEntry(entry)
    // AC 9: emit audit event — no PHI
    reportAtlasView({ entryId: entry.id, categoryId: entry.categoryId })
  }

  function clearEntry() {
    setSelectedEntry(null)
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const selectedSubcategory: AtlasSubcategory | null = useMemo(() => {
    if (!selectedSubcategoryId) return null
    for (const cat of categories) {
      const sub = cat.subcategories.find((s) => s.id === selectedSubcategoryId)
      if (sub) return sub
    }
    return null
  }, [selectedSubcategoryId, categories])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0">
      {/* ---- Category navigation sidebar (inline-start) ---- */}
      <nav
        aria-label={t('categoryNavLabel')}
        className="w-56 shrink-0 border-e border-border bg-muted/30 overflow-y-auto dark:border-border dark:bg-card"
      >
        {/* Search input */}
        <div className="p-3 border-b border-border dark:border-border">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2 text-muted-foreground">
              <Search size={16} aria-hidden="true" />
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchAriaLabel')}
              className="w-full rounded-md border border-border bg-card py-1.5 ps-8 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Category tree */}
        <ul className="py-2" role="tree">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-3 py-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted dark:bg-muted" />
                </li>
              ))
            : categories.map((cat) => (
                <li key={cat.id} role="treeitem" aria-expanded={expandedCategories.has(cat.id)}>
                  {/* Category row */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-muted-foreground dark:hover:bg-card"
                    aria-label={t(cat.name)}
                  >
                    <span className="text-muted-foreground dark:text-muted-foreground">
                      {categoryIcon(cat.icon)}
                    </span>
                    <span className="flex-1 text-start">{t(cat.name)}</span>
                    <span className={`rtl:scale-x-[-1] ${expandedCategories.has(cat.id) ? 'rotate-90' : ''}`}>
                      <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </button>

                  {/* Subcategory list */}
                  {expandedCategories.has(cat.id) && (
                    <ul className="ps-8" role="group">
                      {cat.subcategories.map((sub) => (
                        <li key={sub.id} role="treeitem">
                          <button
                            type="button"
                            onClick={() => selectSubcategory(sub)}
                            className={[
                              'flex w-full items-center gap-2 py-1.5 pe-3 text-sm',
                              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
                              selectedSubcategoryId === sub.id
                                ? 'font-semibold text-blue-600 dark:text-blue-400'
                                : 'text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
                            ].join(' ')}
                          >
                            <span className="text-muted-foreground dark:text-muted-foreground">
                              <ChevronDown size={14} aria-hidden="true" />
                            </span>
                            <span className="flex-1 text-start">{t(sub.name)}</span>
                            <span className="text-xs text-muted-foreground">
                              {sub.entries.length}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
        </ul>
      </nav>

      {/* ---- Main content area ---- */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <AtlasLoadingSkeleton />
        ) : selectedEntry ? (
          <EntryDetailView entry={selectedEntry} onBack={clearEntry} t={t} />
        ) : searchResults !== null ? (
          <SearchResultsView results={searchResults} onSelect={selectEntry} t={t} />
        ) : selectedSubcategory ? (
          <EntryGridView subcategory={selectedSubcategory} onSelect={selectEntry} t={t} />
        ) : (
          <AtlasWelcome t={t} />
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Atlas welcome / empty state
// ---------------------------------------------------------------------------
function AtlasWelcome({ t }: { t: ReturnType<typeof useTranslations<'visualAtlas'>> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground dark:text-muted-foreground">
      <Microscope size={20} aria-hidden="true" />
      <p className="max-w-xs text-sm">{t('welcomeMessage')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry grid view (subcategory selected)
// ---------------------------------------------------------------------------
function EntryGridView({
  subcategory,
  onSelect,
  t,
}: {
  subcategory: AtlasSubcategory
  onSelect: (entry: AtlasEntry) => void
  t: ReturnType<typeof useTranslations<'visualAtlas'>>
}) {
  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold text-foreground dark:text-foreground">
        {t(subcategory.name)}
        <span className="ms-2 text-sm font-normal text-muted-foreground">
          ({subcategory.entries.length})
        </span>
      </h2>

      {subcategory.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noEntries')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="list">
          {subcategory.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onSelect={onSelect} t={t} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry card (thumbnail + name)
// ---------------------------------------------------------------------------
function EntryCard({
  entry,
  onSelect,
  t,
}: {
  entry: AtlasEntry
  onSelect: (entry: AtlasEntry) => void
  t: ReturnType<typeof useTranslations<'visualAtlas'>>
}) {
  const name = t(entry.name)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-start shadow-sm transition hover:border-blue-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-border dark:bg-card dark:hover:border-blue-500"
        aria-label={name}
      >
        {/* Thumbnail */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted dark:bg-muted">
          {entry.placeholder ? (
            <PlaceholderThumbnail name={name} />
          ) : (
            <img
              src={`data:${entry.imageMimeType};base64,${entry.thumbnailImage}`}
              alt={name}
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          )}
        </div>
        {/* Name */}
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-foreground dark:text-foreground line-clamp-2">
            {name}
          </p>
        </div>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Placeholder thumbnail (colored rectangle with icon — no real image yet)
// ---------------------------------------------------------------------------
function PlaceholderThumbnail({ name }: { name: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-blue-50 to-neutral-100 dark:from-blue-900/20 dark:to-neutral-800"
      aria-label={name}
    >
      <span className="text-blue-300 dark:text-blue-600">
        <CircleX size={16} aria-hidden="true" />
      </span>
      <span className="text-center text-[10px] leading-tight text-muted-foreground px-2 line-clamp-2 dark:text-muted-foreground">
        {name}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry detail view
// ---------------------------------------------------------------------------
function EntryDetailView({
  entry,
  onBack,
  t,
}: {
  entry: AtlasEntry
  onBack: () => void
  t: ReturnType<typeof useTranslations<'visualAtlas'>>
}) {
  const name = t(entry.name)
  const description = t(entry.description)
  const clinicalSignificance = t(entry.clinicalSignificance)
  const nextSteps = entry.nextSteps.map((key) => t(key))

  return (
    <article className="mx-auto max-w-2xl p-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:hover:text-blue-200"
        aria-label={t('backToGrid')}
      >
        <ArrowLeft size={16} aria-hidden="true" className="rtl:scale-x-[-1]" />
        {t('backToGrid')}
      </button>

      {/* Entry name */}
      <h1 className="mb-3 text-2xl font-bold text-foreground dark:text-foreground">{name}</h1>

      {/* Full image */}
      <div className="mb-4 overflow-hidden rounded-xl border border-border bg-muted dark:border-border dark:bg-card">
        {entry.placeholder ? (
          <div className="flex aspect-[4/3] max-h-72 w-full items-center justify-center">
            <PlaceholderThumbnail name={name} />
          </div>
        ) : (
          <img
            src={`data:${entry.imageMimeType};base64,${entry.image}`}
            alt={name}
            className="w-full object-contain"
            style={{ maxHeight: '18rem' }}
          />
        )}
        {entry.placeholder && (
          <p className="px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-400 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            {t('placeholderImageNotice')}
          </p>
        )}
      </div>

      {/* Description */}
      <section className="mb-4" aria-label={t('descriptionLabel')}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          {t('descriptionLabel')}
        </h2>
        <p className="text-sm text-foreground dark:text-muted-foreground leading-relaxed">{description}</p>
      </section>

      {/* Clinical significance */}
      <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/40 dark:bg-amber-900/20" aria-label={t('clinicalSignificanceLabel')}>
        <h2 className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
          {t('clinicalSignificanceLabel')}
        </h2>
        <p className="text-sm text-amber-700 dark:text-amber-200 leading-relaxed">{clinicalSignificance}</p>
      </section>

      {/* Recommended next steps */}
      <section className="mb-4" aria-label={t('nextStepsLabel')}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          {t('nextStepsLabel')}
        </h2>
        <ul className="space-y-1">
          {nextSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground dark:text-muted-foreground">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
              {step}
            </li>
          ))}
        </ul>
      </section>

      {/* Author attribution */}
      <footer className="mt-6 rounded-lg border border-border bg-muted/30 px-4 py-3 dark:border-border dark:bg-card/50">
        <p className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">
          {t('curatedBy')}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-foreground dark:text-foreground">
          {entry.author.name}
          <span className="ms-1 text-xs font-normal text-muted-foreground dark:text-muted-foreground">
            {entry.author.credentials}
          </span>
        </p>
        <p className="text-xs text-muted-foreground dark:text-muted-foreground">{entry.author.institution}</p>
        <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
          {t('version')} {entry.version} · {t('lastReviewed')} {entry.lastReviewedAt.slice(0, 10)}
        </p>
      </footer>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Search results view — flat list grouped by category
// ---------------------------------------------------------------------------
function SearchResultsView({
  results,
  onSelect,
  t,
}: {
  results: SearchResult[]
  onSelect: (entry: AtlasEntry) => void
  t: ReturnType<typeof useTranslations<'visualAtlas'>>
}) {
  if (results.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground dark:text-muted-foreground">
        {t('noSearchResults')}
      </div>
    )
  }

  // Group by categoryName
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r._categoryName
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="p-4">
      <p className="mb-4 text-sm text-muted-foreground dark:text-muted-foreground">
        {t('searchResultCount', { count: results.length })}
      </p>
      {Object.entries(grouped).map(([categoryName, groupEntries]) => (
        <div key={categoryName} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
            {categoryName}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="list">
            {groupEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onSelect={onSelect} t={t} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function AtlasLoadingSkeleton() {
  return (
    <div className="p-4" aria-busy="true" aria-label="Loading atlas">
      <div className="mb-4 h-6 w-40 animate-pulse rounded bg-muted dark:bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border dark:border-border">
            <div className="aspect-[4/3] w-full animate-pulse bg-muted dark:bg-muted" />
            <div className="p-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted dark:bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
