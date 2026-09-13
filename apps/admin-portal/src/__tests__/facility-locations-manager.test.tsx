import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FacilityLocationsManager } from '@/components/pharmacies/FacilityLocationsManager'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
const listForAdmin = vi.fn()
const create = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: { facilityLocations: {
    listForAdmin: { query: (...a: unknown[]) => listForAdmin(...a) },
    create: { mutate: (...a: unknown[]) => create(...a) },
    update: { mutate: vi.fn() },
    setActive: { mutate: vi.fn() },
  } },
}))

describe('FacilityLocationsManager', () => {
  it('lists a facility\'s sub-locations', async () => {
    listForAdmin.mockResolvedValue([{ id: 'l1', facilityId: 'f1', name: 'Main store', kind: 'store', isPrimary: true, isActive: true }])
    render(<FacilityLocationsManager facilityId="f1" />)
    await waitFor(() => expect(screen.getByText('Main store')).toBeInTheDocument())
    expect(listForAdmin).toHaveBeenCalledWith({ facilityId: 'f1' })
  })

  it('shows the empty state when the facility has no sub-locations', async () => {
    listForAdmin.mockResolvedValue([])
    render(<FacilityLocationsManager facilityId="f1" />)
    await waitFor(() => expect(screen.getByText('empty')).toBeInTheDocument())
  })
})
