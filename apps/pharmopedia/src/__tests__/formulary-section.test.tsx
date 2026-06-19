import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugEntryTier3 } from '@ultranos/shared-types'
import { FormularySection } from '@/components/DrugDetail/FormularySection'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111', textSecondary: '#444', textMuted: '#999', primary500: '#2e9e71',
    successLight: '#f0fdf4', successDark: '#14532d', dangerLight: '#fef2f2', dangerDark: '#991b1b',
    warningLight: '#fffbeb', warningDark: '#92400e', warning: '#d97706',
  }),
}))

const empty = { atcCode: 'J01CA04', formularyStatus: undefined, dispensingNotes: undefined, substitutes: [], recallAlerts: [] } as unknown as DrugEntryTier3

describe('FormularySection', () => {
  it('renders status, dispensing notes, substitutes and recalls when present', () => {
    const e3 = {
      ...empty, formularyStatus: 'on_formulary', dispensingNotes: 'Refrigerate', substitutes: ['J01CA01'],
      recallAlerts: [{ recallId: 'r1', description: 'Batch recall', status: 'ongoing', initiationDate: '2026-01-01' }],
    } as unknown as DrugEntryTier3
    render(<FormularySection entry={e3} />)
    expect(screen.getByText('formulary.onFormulary')).toBeTruthy()
    expect(screen.getByText('Refrigerate')).toBeTruthy()
    expect(screen.getByText('J01CA01')).toBeTruthy()
    expect(screen.getByText('Batch recall')).toBeTruthy()
  })

  it('renders only populated blocks (no empty placeholders)', () => {
    render(<FormularySection entry={empty} />)
    expect(screen.getByTestId('formulary-section')).toBeTruthy()
    expect(screen.queryByText('formulary.substitutes')).toBeNull()
    expect(screen.queryByText('formulary.recalls')).toBeNull()
  })
})
