'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useLocale } from 'next-intl'
import { getDistrictsByProvince } from '@ultranos/shared-types'
import type { AfghanProvince, AfghanDistrict } from '@ultranos/shared-types'

interface DistrictAutocompleteProps {
  province: AfghanProvince | ''
  value: string
  onChange: (district: string) => void
  label: string
  placeholder: string
  required?: boolean
  error?: string
}

export function DistrictAutocomplete({
  province,
  value,
  onChange,
  label,
  placeholder,
  required,
  error,
}: DistrictAutocompleteProps) {
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs'
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const districts: AfghanDistrict[] = useMemo(
    () => (province ? getDistrictsByProvince(province) : []),
    [province],
  )

  const getDisplayName = useCallback(
    (d: AfghanDistrict) => (isRtl ? d.nameLocal : d.name),
    [isRtl],
  )

  const filtered = useMemo(() => {
    if (!query) return districts
    const q = query.toLowerCase()
    return districts.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.nameLocal.includes(query),
    )
  }, [districts, query])

  // Reset value when province changes
  useEffect(() => {
    if (value && province) {
      const stillValid = districts.some((d) => d.name === value)
      if (!stillValid) {
        onChange('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province])

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

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [query])

  const handleSelect = (district: AfghanDistrict) => {
    onChange(district.name)
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

  useEffect(() => {
    if (highlightedIndex >= 0 && listboxRef.current) {
      const item = listboxRef.current.children[highlightedIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  const disabled = !province
  const inputId = `district-autocomplete-${label.replace(/\s+/g, '-').toLowerCase()}`
  const listboxId = `${inputId}-listbox`

  const selectedDistrict = districts.find((d) => d.name === value)

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={inputId}
        className="mb-1 block text-sm font-semibold text-neutral-700"
      >
        {label}
        {required && <span className="text-red-600 ms-0.5" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        {value && selectedDistrict ? (
          <div
            className={`flex items-center min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 ${
              disabled ? 'opacity-50' : ''
            }`}
          >
            <span className="flex-1 text-sm text-neutral-900">
              {getDisplayName(selectedDistrict)}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setQuery('')
                  inputRef.current?.focus()
                }}
                className="ms-2 rounded p-1 text-neutral-400 transition-colors [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-600"
                aria-label={`Clear ${label}`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
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
            aria-disabled={disabled}
            autoComplete="off"
            disabled={disabled}
            className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              disabled
                ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400'
                : error
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                  : 'border-neutral-300 focus:border-blue-400 focus:ring-blue-400'
            }`}
            placeholder={disabled ? '' : placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => {
              if (!disabled) setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {isOpen && !disabled && !value && filtered.length > 0 && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {filtered.map((district, index) => (
            <li
              key={district.name}
              id={`${inputId}-option-${index}`}
              role="option"
              aria-selected={highlightedIndex === index}
              className={`cursor-pointer px-3 py-2.5 text-sm min-h-[44px] flex items-center ${
                highlightedIndex === index
                  ? 'bg-blue-50 text-blue-900'
                  : 'text-neutral-900 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(district)
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span>{getDisplayName(district)}</span>
              {isRtl && (
                <span className="ms-2 text-xs text-neutral-400">{district.name}</span>
              )}
              {!isRtl && (
                <span className="ms-2 text-xs text-neutral-400">
                  {district.nameLocal}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && !disabled && !value && filtered.length === 0 && query && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-500 shadow-lg">
          No matching district
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
