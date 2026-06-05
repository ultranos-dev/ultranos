'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { X } from '@ultranos/ui-kit/icons'
import { AFGHAN_PROVINCES } from '@ultranos/shared-types'
import type { AfghanProvince } from '@ultranos/shared-types'

// Province display names in Dari/Pashto script
const PROVINCE_NAME_LOCAL: Record<AfghanProvince, string> = {
  Badakhshan: '\u0628\u062f\u062e\u0634\u0627\u0646',
  Badghis: '\u0628\u0627\u062f\u063a\u06cc\u0633',
  Baghlan: '\u0628\u063a\u0644\u0627\u0646',
  Balkh: '\u0628\u0644\u062e',
  Bamyan: '\u0628\u0627\u0645\u06cc\u0627\u0646',
  Daykundi: '\u062f\u0627\u06cc\u06a9\u0646\u062f\u06cc',
  Farah: '\u0641\u0631\u0627\u0647',
  Faryab: '\u0641\u0627\u0631\u06cc\u0627\u0628',
  Ghazni: '\u063a\u0632\u0646\u06cc',
  Ghor: '\u063a\u0648\u0631',
  Helmand: '\u0647\u0644\u0645\u0646\u062f',
  Herat: '\u0647\u0631\u0627\u062a',
  Jawzjan: '\u062c\u0648\u0632\u062c\u0627\u0646',
  Kabul: '\u06a9\u0627\u0628\u0644',
  Kandahar: '\u06a9\u0646\u062f\u0647\u0627\u0631',
  Kapisa: '\u06a9\u0627\u067e\u06cc\u0633\u0627',
  Khost: '\u062e\u0648\u0633\u062a',
  Kunar: '\u06a9\u0646\u0631',
  Kunduz: '\u06a9\u0646\u062f\u0632',
  Laghman: '\u0644\u063a\u0645\u0627\u0646',
  Logar: '\u0644\u0648\u06af\u0631',
  Nangarhar: '\u0646\u0646\u06af\u0631\u0647\u0627\u0631',
  Nimroz: '\u0646\u06cc\u0645\u0631\u0648\u0632',
  Nuristan: '\u0646\u0648\u0631\u0633\u062a\u0627\u0646',
  Paktia: '\u067e\u06a9\u062a\u06cc\u0627',
  Paktika: '\u067e\u06a9\u062a\u06cc\u06a9\u0627',
  Panjshir: '\u067e\u0646\u062c\u0634\u06cc\u0631',
  Parwan: '\u067e\u0631\u0648\u0627\u0646',
  Samangan: '\u0633\u0645\u0646\u06af\u0627\u0646',
  'Sar-e-Pol': '\u0633\u0631\u067e\u0644',
  Takhar: '\u062a\u062e\u0627\u0631',
  Urozgan: '\u0627\u0631\u0632\u06af\u0627\u0646',
  Wardak: '\u0648\u0631\u062f\u06a9',
  Zabul: '\u0632\u0627\u0628\u0644',
}

interface ProvinceAutocompleteProps {
  value: AfghanProvince | ''
  onChange: (province: AfghanProvince | '') => void
  label: string
  placeholder: string
  required?: boolean
  error?: string
}

export function ProvinceAutocomplete({
  value,
  onChange,
  label,
  placeholder,
  required,
  error,
}: ProvinceAutocompleteProps) {
  const t = useTranslations('patientSearch')
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs'
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const getDisplayName = useCallback(
    (province: AfghanProvince) =>
      isRtl ? PROVINCE_NAME_LOCAL[province] : province,
    [isRtl],
  )

  const filtered = AFGHAN_PROVINCES.filter((p) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      p.toLowerCase().includes(q) ||
      PROVINCE_NAME_LOCAL[p].includes(query)
    )
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [query])

  const handleSelect = (province: AfghanProvince) => {
    onChange(province)
    setQuery('')
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      setIsOpen(true)
      return
    }
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          handleSelect(filtered[highlightedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listboxRef.current) {
      const item = listboxRef.current.children[highlightedIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const inputId = `province-autocomplete-${label.replace(/\s+/g, '-').toLowerCase()}`
  const listboxId = `${inputId}-listbox`

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={inputId}
        className="mb-1 block text-sm font-semibold text-foreground"
      >
        {label}
        {required && <span className="text-destructive ms-0.5" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        {value ? (
          <div className="flex items-center min-h-[44px] rounded-lg border border-border bg-background px-3 py-2">
            <span className="flex-1 text-sm text-foreground">
              {getDisplayName(value)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="ms-2 p-1"
              onClick={() => {
                onChange('')
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label={t('clearProvince')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={
              highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined
            }
            aria-required={required}
            aria-invalid={!!error}
            autoComplete="off"
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              error
                ? 'border-destructive focus:border-destructive focus:ring-destructive'
                : 'border-border focus:border-blue-400 focus:ring-blue-400'
            }`}
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {isOpen && !value && filtered.length > 0 && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl ring-[0.65px] ring-gray-400/40 bg-background shadow-lg"
        >
          {filtered.map((province, index) => (
            <li
              key={province}
              id={`${inputId}-option-${index}`}
              role="option"
              aria-selected={highlightedIndex === index}
              className={`cursor-pointer px-3 py-2.5 text-sm min-h-[44px] flex items-center ${
                highlightedIndex === index
                  ? 'bg-blue-50 text-blue-900'
                  : 'text-foreground [@media(hover:hover)and(pointer:fine)]:hover:bg-accent'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(province)
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span>{getDisplayName(province)}</span>
              {isRtl && (
                <span className="ms-2 text-xs text-muted-foreground">{province}</span>
              )}
              {!isRtl && (
                <span className="ms-2 text-xs text-muted-foreground">
                  {PROVINCE_NAME_LOCAL[province]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && !value && filtered.length === 0 && query && (
        <div className="absolute z-20 mt-1 w-full rounded-xl ring-[0.65px] ring-gray-400/40 bg-background px-3 py-3 text-sm text-muted-foreground shadow-lg">
          {t('noMatchingProvince')}
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
