import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FacilityProfileModal } from '@/components/facilities/FacilityProfileModal'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

const getDetailFn = vi.fn().mockResolvedValue({
  id: 'c1',
  name: 'Shifa Clinic',
  facilityType: 'clinic',
  isActive: true,
  archivedAt: null,
  googleRating: 4.6,
  googleReviewCount: 12,
  is247: false,
})
const kindConfig = {
  key: 'clinical',
  i18nNs: 'clinics',
  getDetailFn,
  archiveFn: vi.fn(),
  restoreFn: vi.fn(),
}

describe('FacilityProfileModal', () => {
  it('renders the facility name and rating', async () => {
    render(
      <FacilityProfileModal
        open
        facilityId="c1"
        kindConfig={kindConfig as never}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onChanged={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('Shifa Clinic')).toBeInTheDocument())
    expect(screen.getByText('4.6')).toBeInTheDocument()
  })
})
