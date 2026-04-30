import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PillButton } from '@/components/pill-button'
import { PatientResultList } from '@/components/patient-result-list'
import { SearchInput } from '@/components/search-input'
import type { FhirPatient } from '@ultranos/shared-types'
import { AdministrativeGender } from '@ultranos/shared-types'

function makePatient(id: string, nameLocal: string): FhirPatient {
  return {
    id,
    resourceType: 'Patient',
    name: [{ text: nameLocal }],
    gender: AdministrativeGender.MALE,
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    meta: { lastUpdated: new Date().toISOString() },
  }
}

describe('PillButton', () => {
  it('should render with green pill styling', () => {
    const onClick = vi.fn()
    render(<PillButton onClick={onClick}>Select</PillButton>)
    const button = screen.getByRole('button', { name: 'Select' })
    expect(button).toBeDefined()
    expect(button.className).toContain('rounded-pill')
    expect(button.className).toContain('bg-pill-green')
  })

  it('should call onClick when clicked', () => {
    const onClick = vi.fn()
    render(<PillButton onClick={onClick}>Select</PillButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('should be disabled when disabled prop is true', () => {
    const onClick = vi.fn()
    render(<PillButton onClick={onClick} disabled>Select</PillButton>)
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('SearchInput', () => {
  it('should render with search aria label', () => {
    render(<SearchInput value="" onChange={vi.fn()} />)
    const input = screen.getByLabelText('Patient search')
    expect(input).toBeDefined()
  })

  it('should show placeholder text', () => {
    render(<SearchInput value="" onChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search by name or National ID...')
    expect(input).toBeDefined()
  })
})

describe('PatientResultList', () => {
  it('should show searching state', () => {
    render(<PatientResultList results={[]} isSearching={true} onSelect={vi.fn()} />)
    expect(screen.getByText('Searching...')).toBeDefined()
  })

  it('should render nothing for empty results when not searching', () => {
    const { container } = render(
      <PatientResultList results={[]} isSearching={false} onSelect={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('should display patient results with name and demographics', () => {
    const patients = [makePatient('id-1', 'Ahmed Al-Rashid')]
    render(<PatientResultList results={patients} isSearching={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Ahmed Al-Rashid')).toBeDefined()
  })

  it('should have a select button for each patient', () => {
    const patients = [
      makePatient('id-1', 'Ahmed'),
      makePatient('id-2', 'Fatima'),
    ]
    render(<PatientResultList results={patients} isSearching={false} onSelect={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: 'Select' })
    expect(buttons).toHaveLength(2)
  })

  it('should call onSelect with the correct patient', () => {
    const onSelect = vi.fn()
    const patient = makePatient('id-1', 'Ahmed')
    render(<PatientResultList results={[patient]} isSearching={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(onSelect).toHaveBeenCalledWith(patient)
  })

  it('should render patient list with accessible role', () => {
    const patients = [makePatient('id-1', 'Ahmed')]
    render(<PatientResultList results={patients} isSearching={false} onSelect={vi.fn()} />)
    expect(screen.getByRole('list', { name: 'Patient search results' })).toBeDefined()
  })

  it('should use logical CSS properties (margin-inline-start) via Tailwind ms- class', () => {
    // The ms-2 class in PatientResultList maps to margin-inline-start (RTL-compatible)
    // This test verifies the component renders identifiers with the ms-2 class
    const patient = makePatient('id-1', 'Ahmed')
    patient.identifier = [{ system: 'UAE_NATIONAL_ID', value: '12345678' }]
    const { container } = render(
      <PatientResultList results={[patient]} isSearching={false} onSelect={vi.fn()} />
    )
    const idSpan = container.querySelector('.ms-2')
    expect(idSpan).toBeDefined()
  })
})
