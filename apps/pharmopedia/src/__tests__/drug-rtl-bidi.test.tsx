/**
 * drug-rtl-bidi.test.tsx
 *
 * Regression tests for the RTL "scrambled drug details" bug.
 *
 * A1 — Latin identifier/meta strings (INN · ATC, ATC · class · dose-forms,
 *      brand-name lists) must render with an explicit LTR writing direction so
 *      the Unicode bidi algorithm does not reorder their `·`/comma-separated
 *      segments under I18nManager.forceRTL(true).
 *
 * B1 — Arabic font + right-align must only be applied to text that is actually
 *      in the active RTL language. English fallbacks (no `ar` content) must
 *      render in the Latin font, LTR — never English glyphs in an Arabic face.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugSearchResult, DrugLocalizedText } from '@ultranos/shared-types'
import { resolveLocalized } from '@/lib/localized-text'
import { FontFamily } from '@ultranos/ui-kit/tokens.native'
import { flattenStyle } from './ui-native/_flatten'

// ── shared mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (s: (state: { isBookmarked: () => boolean; toggle: () => void }) => unknown) =>
    s({ isBookmarked: () => false, toggle: vi.fn() }),
}))

vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#ffffff',
    surfaceSubtle: '#f3f4f6',
    border: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    primary500: '#2e9e71',
    danger: '#dc2626',
    dangerLight: '#fef2f2',
    warning: '#d97706',
    warningLight: '#fffbeb',
  }),
}))

vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(View, { testID }, children),
  }
})

import { DrugCard } from '@/components/DrugCard'
import { SectionCard } from '@/components/DrugDetail/SectionCard'

function flat(node: { props: { style?: unknown } }) {
  return flattenStyle(node.props.style)
}

// ── A1: resolveLocalized helper ──────────────────────────────────────────────

describe('resolveLocalized', () => {
  it('returns the localized value and isLocalized=true when the lang exists', () => {
    // The data model declares only en/prs/ps, but synced rows can carry `ar`
    // (Defect B) — the resolver reads the key dynamically.
    const field = { en: 'Antibiotic', ar: 'مضاد حيوي' } as unknown as DrugLocalizedText
    expect(resolveLocalized(field, 'ar')).toEqual({
      text: 'مضاد حيوي',
      isLocalized: true,
    })
  })

  it('falls back to English with isLocalized=false when the lang is missing', () => {
    expect(resolveLocalized({ en: 'Antibiotic' }, 'ar')).toEqual({
      text: 'Antibiotic',
      isLocalized: false,
    })
  })

  it('treats English itself as non-localized (no Arabic styling needed)', () => {
    expect(resolveLocalized({ en: 'Antibiotic' }, 'en')).toEqual({
      text: 'Antibiotic',
      isLocalized: false,
    })
  })

  it('returns empty text for an undefined field', () => {
    expect(resolveLocalized(undefined, 'ar')).toEqual({ text: '', isLocalized: false })
  })
})

// ── A1: DrugCard meta line never reorders ────────────────────────────────────

const BASE: DrugSearchResult = {
  atcCode: 'M01AE01',
  innName: 'Ibuprofen',
  brandNames: ['Advil', 'Nurofen'],
  therapeuticClass: 'NSAID',
  doseForms: ['Tablet 200mg', 'Suspension'],
  localName: undefined,
}

describe('DrugCard — RTL bidi safety (A1) and fallback font (B1)', () => {
  it('A1: meta line forces writingDirection ltr in RTL', () => {
    render(<DrugCard result={{ ...BASE, localName: 'إيبوبروفين' }} lang="ar" onPress={vi.fn()} />)
    expect(flat(screen.getByTestId('drug-meta')).writingDirection).toBe('ltr')
  })

  it('A1: meta line stays ltr in LTR too', () => {
    render(<DrugCard result={BASE} lang="en" onPress={vi.fn()} />)
    expect(flat(screen.getByTestId('drug-meta')).writingDirection).toBe('ltr')
  })

  it('B1: ar with NO localName renders the English INN in the Latin font (not Arabic)', () => {
    render(<DrugCard result={{ ...BASE, localName: undefined }} lang="ar" onPress={vi.fn()} />)
    const style = flat(screen.getByTestId('drug-primary-name'))
    expect(style.fontFamily).not.toBe(FontFamily.arabic)
  })

  it('B1: ar WITH localName renders the Arabic name in the Arabic font', () => {
    render(<DrugCard result={{ ...BASE, localName: 'إيبوبروفين' }} lang="ar" onPress={vi.fn()} />)
    const style = flat(screen.getByTestId('drug-primary-name'))
    expect(style.fontFamily).toBe(FontFamily.arabic)
  })
})

// ── B1 + A1: SectionCard direction depends on content, not ambient ───────────

describe('SectionCard — content-direction styling', () => {
  it('A1: LTR content (isRtl=false) forces writingDirection ltr, no Arabic font', () => {
    render(<SectionCard title="Brand names" text="Advil, Nurofen" isRtl={false} testID="sc" />)
    // the body text node is the second Text; find by its content
    const body = screen.getByText('Advil, Nurofen')
    const style = flat(body)
    expect(style.writingDirection).toBe('ltr')
    expect(style.fontFamily).not.toBe(FontFamily.arabic)
  })

  it('B1: RTL content (isRtl=true) uses the Arabic font and rtl direction', () => {
    render(<SectionCard title="ملخص" text="مضاد حيوي واسع الطيف" isRtl testID="sc" />)
    const body = screen.getByText('مضاد حيوي واسع الطيف')
    const style = flat(body)
    expect(style.fontFamily).toBe(FontFamily.arabic)
    expect(style.writingDirection).toBe('rtl')
  })
})
