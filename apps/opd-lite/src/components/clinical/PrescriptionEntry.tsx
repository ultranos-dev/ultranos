'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import {
  searchMedications,
  type MedicationSearchResult,
  type MedicationItem,
} from '@/lib/medication-search'
import {
  FREQUENCY_OPTIONS,
  EMPTY_PRESCRIPTION_FORM,
  type PrescriptionFormData,
} from '@/lib/prescription-config'
import { enrichDrug } from '@/lib/trpc'
import { DrugSafetyPanel } from '@/components/clinical/DrugSafetyPanel'
import { DrugMonographSheet } from '@/components/clinical/DrugMonographSheet'
import { getBrandNamesForAtc } from '@/lib/drug-entry'

interface PrescriptionEntryProps {
  onSubmit: (form: PrescriptionFormData) => void | Promise<void>
  disabled?: boolean
  canEnrich?: boolean
  patientSex?: string
  patientAge?: number
}

function getDisplayIndices(
  result: MedicationSearchResult,
): readonly [number, number][] | undefined {
  return result.matches?.find((m) => m.key === 'display')?.indices
}

function mergeIndices(
  indices: readonly [number, number][],
): [number, number][] {
  const sorted = [...indices].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

function highlightMatches(
  text: string,
  indices: readonly [number, number][] | undefined,
): React.ReactNode {
  if (!indices || indices.length === 0) return text
  const safe = mergeIndices(indices)
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  for (const [start, end] of safe) {
    const clampedStart = Math.max(start, lastIndex)
    if (clampedStart > lastIndex) {
      parts.push(text.slice(lastIndex, clampedStart))
    }
    parts.push(
      <mark key={start} className="bg-warning/30 text-foreground rounded-sm ps-0.5 pe-0.5">
        {text.slice(clampedStart, end + 1)}
      </mark>,
    )
    lastIndex = end + 1
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return <>{parts}</>
}

export function PrescriptionEntry({ onSubmit, disabled, canEnrich = false, patientSex, patientAge }: PrescriptionEntryProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MedicationSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [form, setForm] = useState<PrescriptionFormData>(EMPTY_PRESCRIPTION_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [localNameEn, setLocalNameEn] = useState('')
  const [localNamePrs, setLocalNamePrs] = useState('')
  const [isEnriching, setIsEnriching] = useState(false)
  const [enrichSuccess, setEnrichSuccess] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [brandOptions, setBrandOptions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)

  const hasMedication = form.medicationCode !== ''

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      return
    }
    // P11: Debounce search to avoid UI jank on low-resource devices
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const seq = ++searchSeqRef.current
    searchTimerRef.current = setTimeout(async () => {
      const found = await searchMedications(value)
      if (seq !== searchSeqRef.current) return  // stale result guard
      setResults(found)
      setIsOpen(found.length > 0)
      setActiveIndex(-1)
    }, 150)
  }, [])

  const handleSelectMedication = useCallback((item: MedicationItem) => {
    setForm((prev) => ({
      ...prev,
      medicationCode: item.code,
      medicationDisplay: item.display,
      medicationForm: item.form,
      medicationStrength: item.strength,
      dosageUnit: (() => {
        const f = item.form.toLowerCase()
        // P4: Check solid forms first to avoid misclassifying compound forms
        // like "Tablet for Oral Solution"
        if (f.includes('tablet') || f.includes('capsule') || f.includes('lozenge')) return 'tablet'
        if (f.includes('ml') || f.includes('suspension') || f.includes('solution') || f.includes('syrup')) return 'mL'
        if (f.includes('drop')) return 'drop'
        if (f.includes('patch')) return 'patch'
        if (f.includes('puff') || f.includes('inhal')) return 'puff'
        return 'dose'
      })(),
    }))
    setQuery(`${item.display} ${item.strength} (${item.form})`)
    setResults([])
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault()
        handleSelectMedication(results[activeIndex]!.item)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    },
    [isOpen, results, activeIndex, handleSelectMedication],
  )

  const handleClearMedication = useCallback(() => {
    setForm(EMPTY_PRESCRIPTION_FORM)
    setQuery('')
    setResults([])
    setValidationError(null)
    setLocalNameEn('')
    setLocalNamePrs('')
    setEnrichSuccess(false)
    setEnrichError(null)
    inputRef.current?.focus()
  }, [])

  const handleEnrich = useCallback(async () => {
    if (!localNameEn && !localNamePrs) return
    setIsEnriching(true)
    setEnrichError(null)
    setEnrichSuccess(false)
    try {
      const localNames: Record<string, string> = {}
      if (localNameEn) localNames.en = localNameEn
      if (localNamePrs) localNames.prs = localNamePrs
      await enrichDrug(form.medicationCode, { localNames })
      setEnrichSuccess(true)
      setLocalNameEn('')
      setLocalNamePrs('')
    } catch {
      setEnrichError('Failed to save local name')
    } finally {
      setIsEnriching(false)
    }
  }, [form.medicationCode, localNameEn, localNamePrs])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!hasMedication || isSubmitting) return
      setValidationError(null)
      const dosageNum = parseFloat(form.dosageQuantity)
      const durationNum = parseInt(form.durationDays, 10)
      if (isNaN(dosageNum) || dosageNum <= 0) {
        setValidationError('Dosage must be a positive number')
        return
      }
      if (isNaN(durationNum) || durationNum <= 0) {
        setValidationError('Duration must be at least 1 day')
        return
      }
      setIsSubmitting(true)
      try {
        await onSubmit(form)
        setForm(EMPTY_PRESCRIPTION_FORM)
        setQuery('')
        inputRef.current?.focus()
      } finally {
        setIsSubmitting(false)
      }
    },
    [form, hasMedication, isSubmitting, onSubmit],
  )

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!form.medicationCode) { setBrandOptions([]); return }
    void getBrandNamesForAtc(form.medicationCode).then((b) => { if (!cancelled) setBrandOptions(b) })
    return () => { cancelled = true }
  }, [form.medicationCode])

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [activeIndex])

  const inputClasses =
    'w-full rounded-xl border border-border bg-background ps-4 pe-4 py-2.5 ' +
    'text-base text-foreground placeholder:text-muted-foreground ' +
    'transition-colors focus:outline-none focus:ring-2 ' +
    'focus:border-primary-400 focus:ring-primary-200 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-black tracking-tight text-foreground">
        Prescription
      </h3>

      {/* Medication search autocomplete */}
      <div className="relative">
        <label htmlFor="medication-search" className="mb-1 block text-sm font-semibold text-foreground">
          Medication
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id="medication-search"
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0) setIsOpen(true)
            }}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => setIsOpen(false), 200)
            }}
            placeholder="Search medication name..."
            disabled={disabled || hasMedication}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls="medication-results"
            aria-activedescendant={
              activeIndex >= 0 ? `medication-option-${activeIndex}` : undefined
            }
            aria-label="Search medications"
            className={inputClasses}
          />
          {hasMedication && (
            <Button
              variant="outline"
              onClick={handleClearMedication}
              aria-label="Clear selected medication"
            >
              Clear
            </Button>
          )}
        </div>

        {isOpen && results.length > 0 && (
          <ul
            ref={listRef}
            id="medication-results"
            role="listbox"
            aria-label="Medication search results"
            className={
              'absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl ' +
              'ring-[0.65px] ring-border/50 bg-background shadow-lg'
            }
          >
            {results.map((result, idx) => (
              <li
                key={result.item.code}
                id={`medication-option-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelectMedication(result.item)
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={
                  'cursor-pointer ps-4 pe-4 py-3 transition-colors ' +
                  (idx === activeIndex ? 'bg-primary-50' : 'hover:bg-muted')
                }
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-foreground">
                    {highlightMatches(result.item.display, getDisplayIndices(result))}
                  </span>
                  <span className="text-sm font-bold text-primary-700">
                    {result.item.strength}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{result.item.form}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasMedication && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`pharmopedia://drug/${form.medicationCode}`}
            className="text-sm font-medium text-primary-700 underline underline-offset-2"
            aria-label="Open in Pharmopedia"
          >
            Open in Pharmopedia
          </a>
          <DrugMonographSheet atcCode={form.medicationCode} label={`${form.medicationDisplay} ${form.medicationStrength}`} />
        </div>
      )}

      {hasMedication && (
        <DrugSafetyPanel atcCode={form.medicationCode} patientSex={patientSex} patientAge={patientAge} />
      )}

      {hasMedication && brandOptions.length > 0 && (
        <div>
          <label htmlFor="brand-hint" className="mb-1 block text-sm font-semibold text-foreground">
            Preferred brand (optional)
          </label>
          <select
            id="brand-hint"
            data-testid="brand-hint-select"
            value={form.brandHint ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, brandHint: e.target.value || undefined }))}
            disabled={disabled}
            className={inputClasses}
            aria-label="Preferred brand"
          >
            <option value="">— Any brand —</option>
            {brandOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      {hasMedication && canEnrich && (
        <div className="rounded-xl ring-[0.65px] ring-border/50 bg-muted p-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Add local name</h4>
          <input
            type="text"
            placeholder="English name override"
            aria-label="English name override"
            value={localNameEn}
            onChange={(e) => setLocalNameEn(e.target.value)}
            disabled={isEnriching}
            className={inputClasses}
          />
          <input
            type="text"
            placeholder="Dari name (دری)"
            aria-label="Dari name"
            value={localNamePrs}
            onChange={(e) => setLocalNamePrs(e.target.value)}
            disabled={isEnriching}
            dir="rtl"
            className={inputClasses}
          />
          {enrichError && (
            <p className="text-sm font-semibold text-destructive">{enrichError}</p>
          )}
          {enrichSuccess && (
            <p className="text-sm font-semibold text-success">Saved</p>
          )}
          <Button
            variant="outline"
            onClick={handleEnrich}
            disabled={isEnriching || (!localNameEn && !localNamePrs)}
          >
            {isEnriching ? 'Saving...' : 'Save name'}
          </Button>
        </div>
      )}

      {/* Dosage sub-form — visible when medication is selected */}
      {hasMedication && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl ring-[0.65px] ring-border/50 bg-muted p-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Dosage quantity */}
            <div>
              <label htmlFor="dosage-quantity" className="mb-1 block text-sm font-semibold text-foreground">
                Dosage
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="dosage-quantity"
                  type="number"
                  min="0.25"
                  max="1000"
                  step="0.25"
                  value={form.dosageQuantity}
                  onChange={(e) => setForm((prev) => ({ ...prev, dosageQuantity: e.target.value }))}
                  disabled={disabled}
                  className={inputClasses}
                  aria-label="Dosage quantity"
                />
                <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                  {form.dosageUnit}
                </span>
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label htmlFor="frequency" className="mb-1 block text-sm font-semibold text-foreground">
                Frequency
              </label>
              <select
                id="frequency"
                value={form.frequencyCode}
                onChange={(e) => setForm((prev) => ({ ...prev, frequencyCode: e.target.value }))}
                disabled={disabled}
                className={inputClasses}
                aria-label="Frequency"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.display}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label htmlFor="duration" className="mb-1 block text-sm font-semibold text-foreground">
                Duration (days)
              </label>
              <input
                id="duration"
                type="number"
                min="1"
                max="365"
                step="1"
                value={form.durationDays}
                onChange={(e) => setForm((prev) => ({ ...prev, durationDays: e.target.value }))}
                disabled={disabled}
                className={inputClasses}
                aria-label="Duration in days"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="prescription-notes" className="mb-1 block text-sm font-semibold text-foreground">
              Notes (optional)
            </label>
            <input
              id="prescription-notes"
              type="text"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="e.g., Take with food"
              maxLength={500}
              disabled={disabled}
              className={inputClasses}
              aria-label="Prescription notes"
            />
          </div>

          {validationError && (
            <p className="text-sm font-semibold text-destructive" role="alert">{validationError}</p>
          )}

          <Button
            variant="primary"
            type="submit"
            disabled={disabled || !hasMedication || isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Add Prescription'}
          </Button>
        </form>
      )}
    </div>
  )
}
