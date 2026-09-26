import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatientResultList } from '@/components/patient-result-list'

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}))

// One result (0 < length < 3) so the "register new" affordance renders.
const results = [
  {
    id: 'x',
    resourceType: 'Patient',
    name: [{ text: 'Test Patient' }],
    _ultranos: { nameLocal: 'Test Patient' },
    birthDate: '1990',
    birthYearOnly: true,
    gender: 'male',
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any

describe('PatientResultList — register-new affordance', () => {
  it('calls onRegisterNew(query) from a button when the callback is provided (modal-in-place)', () => {
    const onRegisterNew = vi.fn()
    render(
      <PatientResultList
        results={results}
        isSearching={false}
        onSelect={vi.fn()}
        query="Ahmad"
        onRegisterNew={onRegisterNew}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /registerNew/i }))
    expect(onRegisterNew).toHaveBeenCalledWith('Ahmad')
  })

  it('falls back to a /register-patient deep-link when no callback is given', () => {
    render(
      <PatientResultList
        results={results}
        isSearching={false}
        onSelect={vi.fn()}
        query="Ahmad"
      />,
    )
    const link = screen.getByRole('link', { name: /registerNew/i })
    expect(link.getAttribute('href')).toContain('/register-patient?nameGiven=Ahmad')
  })
})
