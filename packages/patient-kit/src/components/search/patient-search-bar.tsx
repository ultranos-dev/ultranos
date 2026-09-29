'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { Avatar } from '@ultranos/ui-kit/components/ui/avatar'
import { highlightQuery } from '@ultranos/ui-kit/lib/highlight'

/**
 * A single normalized patient result. Each app maps its native record
 * (FhirPatient / LocalPatient / lab list-tier item) to this shape in its
 * `search` adapter, so the bar renders identically everywhere.
 */
export interface PatientSearchResult {
  /** Stable key + value passed back on select via `raw`. */
  id: string
  /** Full name shown in the row — the typed query is highlighted within it. */
  displayName: string
  gender?: string | null
  /** Preformatted age label, e.g. "34y" / "~34y". */
  ageLabel?: string | null
  phone?: string | null
  /** Short-lived signed URL (opaque-key). Null/omitted → initials avatar. */
  photoUrl?: string | null
  /** Renders the red allergy badge (Rule #4). */
  hasAllergies?: boolean
  /** The app's native record, handed back verbatim to `onSelect`. */
  raw?: unknown
}

export interface PatientSearchResponse {
  results: PatientSearchResult[]
  /** True when the Hub revalidation failed — surfaced, never masked (Rule #3 spirit). */
  hubUnavailable?: boolean
}

export interface PatientSearchBarProps {
  /**
   * App-injected search: runs the local-first (Dexie) + Hub search and returns
   * normalized results. Receives an AbortSignal so stale requests can be cancelled.
   */
  search: (query: string, signal: AbortSignal) => Promise<PatientSearchResponse>
  /** Called with the chosen result (use `result.raw` for the native record). */
  onSelect: (result: PatientSearchResult) => void
  /** Optional "register new patient" affordance shown under sparse result sets. */
  onRegisterNew?: (query: string) => void
  /**
   * Optional lazy photo resolver (opaque-key signed URL). When provided, photos
   * are resolved per rendered result — apps needn't pre-resolve them in `search`.
   * Results that already carry `photoUrl` are used as-is.
   */
  resolvePhotoUrl?: (id: string, signal: AbortSignal) => Promise<string | null>

  placeholder?: string
  searchLabel?: string
  searchingLabel?: string
  noResultsLabel?: string
  registerNewLabel?: string
  allergyLabel?: string
  hubUnavailableLabel?: string

  /** Minimum characters before searching. Default 1. */
  minChars?: number
  /** Debounce before firing the search. Default 250ms. */
  debounceMs?: number
  /** Show patient photos in results. Default true. */
  showPhotos?: boolean
  /** Show "register new" when result count is below this. Default 3. Set 0 to hide. */
  registerNewThreshold?: number
  /** Clear the field after a selection. Default false (keeps the chosen name). */
  clearOnSelect?: boolean
  autoFocus?: boolean
  /** Wrapper layout classes (e.g. `flex-1`). */
  className?: string
  /** Extra classes for the inner input. */
  inputClassName?: string
  'data-testid'?: string
}

function metaLine(r: PatientSearchResult): string {
  return [r.gender, r.ageLabel, r.phone].filter(Boolean).join(' · ')
}

/**
 * The single, shared patient search bar. Search-as-you-type with match
 * highlighting (the same `highlightQuery` util the medication search uses),
 * a results dropdown, and a normalized result model so every app/page/modal
 * gets identical behavior. Search by name, patient ID, or National ID is the
 * responsibility of the injected `search` adapter.
 */
export function PatientSearchBar({
  search,
  onSelect,
  onRegisterNew,
  resolvePhotoUrl,
  placeholder,
  searchLabel,
  searchingLabel = 'Searching…',
  noResultsLabel = 'No patients found',
  registerNewLabel,
  allergyLabel = 'Allergies',
  hubUnavailableLabel,
  minChars = 1,
  debounceMs = 250,
  showPhotos = true,
  registerNewThreshold = 3,
  clearOnSelect = false,
  autoFocus = false,
  className,
  inputClassName,
  'data-testid': dataTestId,
}: PatientSearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hubUnavailable, setHubUnavailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [photoMap, setPhotoMap] = useState<Map<string, string>>(new Map())

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listboxId = useId()

  const runSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (trimmed.length < minChars) {
        setResults([])
        setIsSearching(false)
        setHubUnavailable(false)
        setOpen(false)
        return
      }
      setIsSearching(true)
      setOpen(true)
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      search(trimmed, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return
          setResults(res.results)
          setHubUnavailable(!!res.hubUnavailable)
        })
        .catch(() => {
          if (controller.signal.aborted) return
          // Adapter errors → show the empty/hub-unavailable state, never a false "no results".
          setResults([])
          setHubUnavailable(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false)
        })
    },
    [search, minChars],
  )

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => runSearch(value), debounceMs)
    },
    [runSearch, debounceMs],
  )

  const handleSelect = useCallback(
    (result: PatientSearchResult) => {
      onSelect(result)
      setQuery(clearOnSelect ? '' : result.displayName)
      setResults([])
      setOpen(false)
    },
    [onSelect, clearOnSelect],
  )

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Cleanup timers/abort on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Lazily resolve photos for the current results (opaque-key signed URLs).
  const resultIdsKey = results.map((r) => r.id).join(',')
  useEffect(() => {
    if (!resolvePhotoUrl || results.length === 0) {
      setPhotoMap(new Map())
      return
    }
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      const entries = await Promise.all(
        results.map(async (r) => [r.id, r.photoUrl ?? (await resolvePhotoUrl(r.id, controller.signal))] as const),
      )
      if (cancelled) return
      const map = new Map<string, string>()
      for (const [id, url] of entries) if (url) map.set(id, url)
      setPhotoMap(map)
    })().catch(() => { /* photo resolution is best-effort; fall back to initials */ })
    return () => { cancelled = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultIdsKey, resolvePhotoUrl])

  const trimmed = query.trim()
  const showRegisterNew =
    !!onRegisterNew && registerNewThreshold > 0 && results.length < registerNewThreshold && trimmed.length >= minChars

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`} data-testid={dataTestId}>
      <SearchInput
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        searchLabel={searchLabel}
        inputClassName={inputClassName}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (results.length > 0 || (isSearching && trimmed.length >= minChars)) setOpen(true) }}
        onSearch={() => runSearch(query)}
      />

      {open && trimmed.length >= minChars && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
          <ul id={listboxId} role="listbox" className="max-h-72 divide-y divide-border overflow-y-auto">
            {isSearching && results.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground" role="status">{searchingLabel}</li>
            )}
            {!isSearching && results.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">{noResultsLabel}</li>
            )}
            {results.map((r) => (
              <li key={r.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                  data-testid={dataTestId ? `${dataTestId}-option-${r.id}` : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {showPhotos && <Avatar src={photoMap.get(r.id) ?? r.photoUrl ?? null} name={r.displayName} size={28} />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground" dir="auto">
                        {highlightQuery(r.displayName, query)}
                      </span>
                      {metaLine(r) && (
                        <span className="block truncate text-xs text-muted-foreground">{metaLine(r)}</span>
                      )}
                    </span>
                  </span>
                  {r.hasAllergies && (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      {allergyLabel}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {hubUnavailable && hubUnavailableLabel && (
            <p role="status" className="border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {hubUnavailableLabel}
            </p>
          )}

          {showRegisterNew && (
            <button
              type="button"
              onClick={() => onRegisterNew?.(trimmed)}
              className="flex w-full items-center justify-center gap-2 border-t border-border px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {registerNewLabel ?? '+ Register new patient'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
