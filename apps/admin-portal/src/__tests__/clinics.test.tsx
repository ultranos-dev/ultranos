import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ClinicsPage from '@/app/[locale]/clinics/page'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
vi.mock('@/lib/trpc', () => ({
  trpc: {
    clinicalFacility: {
      listForAdmin: {
        query: vi.fn().mockResolvedValue({
          facilities: [
            {
              id: 'c1',
              name: 'Shifa Clinic',
              facilityType: 'clinic',
              isActive: true,
              archivedAt: null,
              city: 'Kabul',
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

describe('ClinicsPage', () => {
  it('lists clinical facilities', async () => {
    render(<ClinicsPage />)
    await waitFor(() => expect(screen.getByText('Shifa Clinic')).toBeInTheDocument())
  })
})
