import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PharmacyManager } from '@/components/pharmacies/PharmacyManager'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
vi.mock('@/lib/trpc', () => ({
  trpc: {
    pharmacy: {
      listForAdmin: { query: vi.fn().mockResolvedValue({ pharmacies: [
        { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', district: 'D10', address: 'Shahr-e Naw', facilityType: 'pharmacy', isActive: true, latitude: 34.5, longitude: 69.2 },
      ], nextCursor: null }) },
      create: { mutate: vi.fn() }, setActive: { mutate: vi.fn() },
    },
  },
}))

describe('PharmacyManager', () => {
  it('lists pharmacies from the admin endpoint', async () => {
    render(<PharmacyManager />)
    await waitFor(() => expect(screen.getByText('Kabul City Pharmacy')).toBeInTheDocument())
  })
})
