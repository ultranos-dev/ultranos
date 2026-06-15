import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { DrugCard } from '@/components/DrugCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (s: (state: { isBookmarked: (atcCode: string) => boolean }) => unknown) =>
    s({ isBookmarked: () => false }),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#ffffff',
    surfaceSubtle: '#f3f4f6',
    borderSubtle: '#e5e7eb',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    danger: '#dc2626',
  }),
}))

const BASE: DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: [],
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg'],
  localName: undefined,
}

describe('DrugCard — local-name-as-primary-title', () => {
  it('shows INN as primary when no localName', () => {
    render(<DrugCard result={BASE} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
    expect(screen.queryByTestId('drug-secondary-name')).toBeNull()
  })

  it('shows INN as primary when lang is en even with localName', () => {
    render(<DrugCard result={{ ...BASE, localName: 'Amox Local' }} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
  })

  it('promotes localName to primary and INN to subtitle when lang is prs', () => {
    render(<DrugCard result={{ ...BASE, localName: 'آموکسیسیلین' }} lang="prs" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('آموکسیسیلین')
    expect(screen.getByTestId('drug-secondary-name').props.children).toBe('Amoxicillin')
  })

  it('promotes localName when lang is ar', () => {
    render(<DrugCard result={{ ...BASE, localName: 'أموكسيسيلين' }} lang="ar" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('أموكسيسيلين')
  })

  it('falls back to INN as primary when lang is prs but localName is absent', () => {
    render(<DrugCard result={BASE} lang="prs" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
  })
})
