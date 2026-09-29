import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

// The component now uses the shared PatientSearchBar driven by the lab adapter.
// Mock the adapter factory to return a single result so we can assert highlighting.
vi.mock('@/lib/patient-search-adapter', () => ({
  makePatientSearchAdapter: () => async () => ({
    results: [
      { id: '1', displayName: 'Kabir', ageLabel: '30y', raw: { id: '1', firstName: 'Kabir', age: 30, source: 'remote' } },
    ],
  }),
}))

import { PatientSearchInput } from '@/components/upload/PatientSearchInput'

describe('PatientSearchInput highlighting', () => {
  it('highlights the typed query in the result name', async () => {
    const { container } = render(<PatientSearchInput token="t" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kab' } })
    await waitFor(() => {
      expect(container.querySelector('mark')?.textContent).toBe('Kab')
    })
  })
})
