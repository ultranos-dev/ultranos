'use client'

import { useEffect, useState } from 'react'
import { getLocalBrandsByAtc } from '@/lib/drug-catalog-queries'

export interface BrandSelection {
  brandId?: string
  brandName: string
  presentationId?: string
}

interface Option { key: string; label: string; sel: BrandSelection }

export function BrandSubstitutionPicker({
  atc, value, onSelect,
}: { atc?: string; value: string; onSelect: (sel: BrandSelection) => void }) {
  const [options, setOptions] = useState<Option[] | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!atc) { setOptions([]); return }
    void getLocalBrandsByAtc(atc).then((brands) => {
      if (cancelled) return
      const opts: Option[] = []
      for (const { brand, presentations } of brands) {
        if (presentations.length === 0) {
          opts.push({ key: `${brand.id}::`, label: brand.brandName, sel: { brandId: brand.id, brandName: brand.brandName } })
        }
        for (const p of presentations) {
          const label = `${brand.brandName}${p.strength ? ` ${p.strength}` : ''}${p.doseForm ? ` ${p.doseForm}` : ''}`
          opts.push({ key: `${brand.id}::${p.id}`, label, sel: { brandId: brand.id, brandName: brand.brandName, presentationId: p.id } })
        }
      }
      setOptions(opts)
    }).catch(() => { if (!cancelled) setOptions([]) })
    return () => { cancelled = true }
  }, [atc])

  // Still loading — render an untagged placeholder so waitFor blocks until resolved.
  if (options === null) {
    return (
      <select
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
        disabled
        value=""
        onChange={() => undefined}
      >
        <option value="">Loading brands…</option>
      </select>
    )
  }

  // Free-text fallback: no atc, or atc resolved to zero brands.
  if (options.length === 0) {
    return (
      <input
        data-testid="brand-freetext"
        type="text"
        value={value}
        onChange={(e) => onSelect({ brandName: e.target.value })}
        placeholder="Brand name"
        className="w-full rounded-md border border-border px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    )
  }

  return (
    <select
      data-testid="brand-select"
      className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      value={value || ''}
      onChange={(e) => {
        const key = e.target.value
        const opt = options.find((o) => o.key === key)
        if (opt) onSelect(opt.sel)
      }}
    >
      <option value="" disabled>Select a brand</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  )
}
