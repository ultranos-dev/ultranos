import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FacilityFormModal } from '@/components/facilities/FacilityFormModal'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const createFn = vi.fn().mockResolvedValue({ id: 'c1' })
const kindConfig = { key: 'clinical', i18nNs: 'clinics', typeOptions: ['clinic','hospital','opd'], extraFields: [], createFn, updateFn: vi.fn() }

describe('FacilityFormModal', () => {
  it('requires a name and calls createFn on save', async () => {
    render(<FacilityFormModal open kindConfig={kindConfig as never} onOpenChange={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Shifa Clinic' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shifa Clinic' })))
  })
})
