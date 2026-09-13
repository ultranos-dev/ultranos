'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import { searchPharmacies, type PharmacySearchResult } from '@/lib/pharmacy-search'
import { highlightMatches, getMatchIndices } from '@/lib/highlight-matches'
import type { PharmacyDirectoryEntry } from '@ultranos/shared-types'

interface PharmacyPickerProps {
  value?: string
  name?: string
  onSelect: (id: string, name: string) => void
  onClear: () => void
}

const inputClasses =
  'w-full rounded-xl border border-border bg-background ps-4 pe-4 py-2.5 ' +
  'text-base text-foreground placeholder:text-muted-foreground ' +
  'transition-colors focus:outline-none focus:ring-2 ' +
  'focus:border-primary focus:ring-ring ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export function PharmacyPicker({ value, name, onSelect, onClear }: PharmacyPickerProps) {
  const t = useTranslations('prescription')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PharmacySearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  const handleChange = useCallback((raw: string) => {
    setQuery(raw)
    setActiveIndex(-1)
    if (raw.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      return
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const seq = ++searchSeqRef.current
    searchTimerRef.current = setTimeout(async () => {
      const found = await searchPharmacies(raw)
      if (seq !== searchSeqRef.current) return
      setResults(found)
      setIsOpen(found.length > 0)
      setActiveIndex(-1)
    }, 150)
  }, [])

  const handleSelect = useCallback(
    (pharmacy: PharmacyDirectoryEntry) => {
      onSelect(pharmacy.id, pharmacy.name)
      setQuery('')
      setResults([])
      setIsOpen(false)
      setActiveIndex(-1)
    },
    [onSelect],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || results.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]!.item)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setActiveIndex(-1)
      }
    },
    [isOpen, results, activeIndex, handleSelect],
  )

  // When a pharmacy is already selected, show a clearable chip instead of the combobox
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5">
        <span className="flex-1 text-base text-foreground">{name}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={t('clearPharmacy')}
          className="shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="pharmacy-results"
        aria-activedescendant={activeIndex >= 0 ? `pharmacy-option-${activeIndex}` : undefined}
        aria-label={t('pharmacyAria')}
        placeholder={t('pharmacySearchPlaceholder')}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true)
        }}
        onBlur={() => {
          blurTimerRef.current = setTimeout(() => {
            setIsOpen(false)
            setActiveIndex(-1)
          }, 200)
        }}
        className={inputClasses}
      />

      {isOpen && results.length > 0 && (
        <ul
          id="pharmacy-results"
          role="listbox"
          aria-label={t('pharmacyAria')}
          className={
            'absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl ' +
            'ring-[0.65px] ring-border/50 bg-background shadow-lg'
          }
        >
          {results.map((result, idx) => {
            const pharmacy = result.item
            const subtitle = [
              pharmacy.address,
              [pharmacy.province, pharmacy.district].filter(Boolean).join('/'),
              pharmacy.facilityType,
            ]
              .filter(Boolean)
              .join(' · ')

            return (
              <li
                key={pharmacy.id}
                id={`pharmacy-option-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(pharmacy)
                }}
                className={
                  'cursor-pointer ps-4 pe-4 py-3 transition-colors ' +
                  (idx === activeIndex ? 'bg-muted' : 'hover:bg-muted')
                }
              >
                <div className="font-semibold text-foreground">
                  {highlightMatches(pharmacy.name, getMatchIndices(result.matches, 'name'))}
                </div>
                {subtitle && (
                  <div className="text-xs text-muted-foreground">{subtitle}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
