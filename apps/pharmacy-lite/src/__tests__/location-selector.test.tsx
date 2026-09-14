import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LocationSelector } from '@/components/sidebar/LocationSelector'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const setCurrentLocation = vi.fn()
let state: { locations: unknown[]; currentLocationId: string } = { locations: [], currentLocationId: 'default' }
vi.mock('@/stores/location-store', () => ({
  useLocationStore: (sel: (s: unknown) => unknown) => sel({ ...state, setCurrentLocation }),
}))

beforeEach(() => { setCurrentLocation.mockClear() })

describe('LocationSelector', () => {
  it('renders active locations plus the All option and dispatches changes', () => {
    state = { locations: [{ id: 'main', name: 'Main', isActive: true, isPrimary: true }, { id: 'fridge', name: 'Fridge', isActive: true, isPrimary: false }], currentLocationId: 'main' }
    render(<LocationSelector />)
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Fridge')).toBeInTheDocument()
    expect(screen.getByText('allLocations')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fridge' } })
    expect(setCurrentLocation).toHaveBeenCalledWith('fridge')
  })
  it('shows a single disabled Default when the cache is empty', () => {
    state = { locations: [], currentLocationId: 'default' }
    render(<LocationSelector />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByText('defaultLocation')).toBeInTheDocument()
  })
})
