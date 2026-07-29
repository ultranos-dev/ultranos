'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { searchCatalog } from '@/lib/inventory/catalog-sync'
import type { CatalogItem } from '@/lib/inventory/types'

interface CatalogSearchInputProps {
  onSelect: (item: CatalogItem) => void
  placeholder?: string
}

export function CatalogSearchInput({ onSelect, placeholder }: CatalogSearchInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setIsOpen(false); return }
    const items = await searchCatalog(q)
    setResults(items)
    setIsOpen(items.length > 0)
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => handleSearch(query), 200)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, handleSearch])

  const handleSelect = (item: CatalogItem) => {
    onSelect(item)
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <SearchInput
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onSearch={() => handleSearch(query)}
        placeholder={placeholder ?? 'Search by name or scan barcode...'}
        className="w-full"
        data-testid="catalog-search-input"
      />
      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full divide-y divide-border rounded-lg border border-border bg-card shadow-card overflow-hidden max-h-60 overflow-y-auto">
          {results.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-accent text-sm"
              onClick={() => handleSelect(item)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(item) }}
              tabIndex={0}
            >
              <div>
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="text-muted-foreground ms-2">{item.strength} {item.form}</span>
              </div>
              {item.barcode && (
                <span className="text-xs text-muted-foreground font-mono">{item.barcode}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
