'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { searchVocab, type VocabSearchResult, type Icd10Item } from '@/lib/vocab-search'
import type { DiagnosisRank } from '@/lib/condition-mapper'

interface DiagnosisSearchProps {
  onSelect: (item: Icd10Item, rank: DiagnosisRank) => void
  disabled?: boolean
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
      <mark key={start} className="bg-amber-200 text-neutral-900 rounded-sm px-0.5">
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

function getDisplayIndices(
  result: VocabSearchResult,
): readonly [number, number][] | undefined {
  if (!result.matches) return undefined
  const displayMatch = result.matches.find((m) => m.key === 'display')
  return displayMatch?.indices
}

function getCodeIndices(
  result: VocabSearchResult,
): readonly [number, number][] | undefined {
  if (!result.matches) return undefined
  const codeMatch = result.matches.find((m) => m.key === 'code')
  return codeMatch?.indices
}

export function DiagnosisSearch({ onSelect, disabled }: DiagnosisSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VocabSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selectedRank, setSelectedRank] = useState<DiagnosisRank>('primary')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      return
    }
    // Debounce
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    const seq = ++searchSeqRef.current
    searchTimerRef.current = setTimeout(async () => {
      const found = await searchVocab(value)
      // Stale result guard: discard if a newer search started
      if (seq !== searchSeqRef.current) return
      setResults(found)
      setIsOpen(found.length > 0)
      setActiveIndex(-1)
    }, 150)
  }, [])

  const handleSelect = useCallback(
    (item: Icd10Item) => {
      onSelect(item, selectedRank)
      setQuery('')
      setResults([])
      setIsOpen(false)
      setActiveIndex(-1)
      inputRef.current?.focus()
    },
    [onSelect, selectedRank],
  )

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
        handleSelect(results[activeIndex].item)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    },
    [isOpen, results, activeIndex, handleSelect],
  )

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [activeIndex])

  return (
    <div className="space-y-3">
      <h3 className="text-2xl font-black tracking-tight text-neutral-900">
        Diagnosis
      </h3>

      {/* Rank toggle */}
      <div className="flex gap-2" role="radiogroup" aria-label="Diagnosis rank">
        <button
          type="button"
          role="radio"
          aria-checked={selectedRank === 'primary'}
          onClick={() => setSelectedRank('primary')}
          className={
            'rounded-lg px-4 py-2 text-sm font-semibold transition-colors ' +
            (selectedRank === 'primary'
              ? 'bg-primary-600 text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')
          }
        >
          Primary
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={selectedRank === 'secondary'}
          onClick={() => setSelectedRank('secondary')}
          className={
            'rounded-lg px-4 py-2 text-sm font-semibold transition-colors ' +
            (selectedRank === 'secondary'
              ? 'bg-primary-600 text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200')
          }
        >
          Secondary
        </button>
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          onBlur={() => {
            // Delay close to allow click on results
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 200)
          }}
          placeholder="Search ICD-10 code or diagnosis name..."
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="diagnosis-results"
          aria-activedescendant={
            activeIndex >= 0 ? `diagnosis-option-${activeIndex}` : undefined
          }
          aria-label="Search diagnoses"
          className={
            'w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 ' +
            'text-base text-neutral-900 placeholder:text-neutral-400 ' +
            'transition-colors focus:outline-none focus:ring-2 ' +
            'focus:border-primary-400 focus:ring-primary-200 ' +
            'disabled:opacity-50 disabled:cursor-not-allowed'
          }
        />

        {/* Results dropdown */}
        {isOpen && results.length > 0 && (
          <ul
            ref={listRef}
            id="diagnosis-results"
            role="listbox"
            aria-label="Search results"
            className={
              'absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg ' +
              'border border-neutral-200 bg-white shadow-lg'
            }
          >
            {results.map((result, idx) => (
              <li
                key={result.item.code}
                id={`diagnosis-option-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(result.item)
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={
                  'cursor-pointer px-4 py-3 transition-colors ' +
                  (idx === activeIndex
                    ? 'bg-primary-50'
                    : 'hover:bg-neutral-50')
                }
              >
                <span className="font-mono text-sm font-bold text-primary-700">
                  {highlightMatches(result.item.code, getCodeIndices(result))}
                </span>
                <span className="mx-2 text-neutral-300">|</span>
                <span className="text-sm text-neutral-700">
                  {highlightMatches(
                    result.item.display,
                    getDisplayIndices(result),
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
