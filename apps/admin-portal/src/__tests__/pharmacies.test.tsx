import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PharmaciesPage from '@/app/[locale]/pharmacies/page'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
vi.mock('@/lib/trpc', () => ({
  trpc: {
    pharmacy: {
      listForAdmin: {
        query: vi.fn().mockResolvedValue({
          facilities: [
            {
              id: 'p1',
              name: 'Kabul City Pharmacy',
              province: 'Kabul',
              city: 'Kabul',
              facilityType: 'pharmacy',
              isActive: true,
              archivedAt: null,
            },
          ],
          nextCursor: null,
        }),
      },
      getDetail: { query: vi.fn() },
      create: { mutate: vi.fn() },
      update: { mutate: vi.fn() },
      archive: { mutate: vi.fn() },
      restore: { mutate: vi.fn() },
    },
  },
}))

describe('PharmaciesPage', () => {
  it('lists pharmacies from the admin endpoint', async () => {
    render(<PharmaciesPage />)
    await waitFor(() => expect(screen.getByText('Kabul City Pharmacy')).toBeInTheDocument())
  })
})
