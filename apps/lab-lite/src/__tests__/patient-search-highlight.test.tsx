import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatientSearchInput } from '@/components/upload/PatientSearchInput'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@/hooks/usePatientSearch', () => ({
  usePatientSearch: () => ({
    query: 'kab',
    results: [{ id: '1', firstName: 'Kabir', age: 30 }],
    isSearching: false,
    search: vi.fn(),
    clear: vi.fn(),
  }),
}))

describe('PatientSearchInput highlighting', () => {
  it('highlights the typed query in the result name', () => {
    const { container } = render(<PatientSearchInput token="t" onSelect={vi.fn()} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(container.querySelector('mark')?.textContent).toBe('Kab')
  })
})
