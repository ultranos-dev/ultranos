import { describe, it, expect } from 'vitest'
import en from '@/i18n/locales/en'
import prs from '@/i18n/locales/prs'
import ps from '@/i18n/locales/ps'
import ar from '@/i18n/locales/ar'

type Dict = Record<string, unknown>
function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Dict, key))
    else out[key] = String(v)
  }
  return out
}

// Keys whose value is legitimately identical to English (acronyms / brand tokens).
const ALLOWLIST = new Set<string>([
  // Language selector labels: every locale displays all 4 language names identically
  // (the same short-form names are used regardless of the active language).
  'search.lang.en',   // 'EN' — ISO code, no translation
  'search.lang.prs',  // 'دری' — the Dari name shown in every locale's language picker
  'search.lang.ps',   // 'پښتو' — the Pashto name shown in every locale's language picker
  'search.lang.ar',   // 'عربي' — the Arabic name shown in every locale's language picker
])

const EN = flatten(en as Dict)
const LOCALES: Record<string, Record<string, string>> = {
  prs: flatten(prs as Dict), ps: flatten(ps as Dict), ar: flatten(ar as Dict),
}

describe('locale parity', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name} has exactly the same keys as en`, () => {
      expect(Object.keys(loc).sort()).toEqual(Object.keys(EN).sort())
    })
    it(`${name} has no untranslated English stubs`, () => {
      const stubs = Object.keys(EN).filter((k) => !ALLOWLIST.has(k) && loc[k] === EN[k] && (EN[k] ?? '').trim() !== '')
      expect(stubs).toEqual([])
    })
  }
})
