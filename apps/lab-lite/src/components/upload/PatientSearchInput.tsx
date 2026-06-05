'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { usePatientSearch, type PatientSearchItem } from '@/hooks/usePatientSearch'

interface PatientSearchInputProps {
  token: string
  onSelect: (patient: PatientSearchItem) => void
}

export function PatientSearchInput({ token, onSelect }: PatientSearchInputProps) {
  const t = useTranslations('verification')
  const { query, results, isSearching, search, clear } = usePatientSearch(token)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleInputChange = useCallback((value: string) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      search(value)
      setIsOpen(value.trim().length >= 2)
    }, 250)
  }, [search])

  const handleSelect = useCallback((patient: PatientSearchItem) => {
    onSelect(patient)
    clear()
    setIsOpen(false)
  }, [onSelect, clear])

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

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="patient-search" className="text-sm font-medium text-foreground">
        {t('searchPatients')}
      </label>
      <input
        id="patient-search"
        type="text"
        placeholder={t('searchPatientsPlaceholder')}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (query.trim().length >= 2) setIsOpen(true) }}
        className="mt-1 w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls="patient-search-results"
        role="combobox"
      />

      {isOpen && (
        <ul
          id="patient-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
        >
          {isSearching && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">{t('searching')}</li>
          )}
          {!isSearching && results.length === 0 && query.trim().length >= 2 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">{t('noSearchResults')}</li>
          )}
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                role="option"
                onClick={() => handleSelect(patient)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-start hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
              >
                <span className="text-sm font-medium text-foreground">{patient.firstName}</span>
                <span className="text-xs text-muted-foreground">{patient.age} years</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
