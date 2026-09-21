import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FacilityFormModal } from '@/components/facilities/FacilityFormModal'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

const createFn: (input: Record<string, unknown>) => Promise<{ id: string }> = vi
  .fn()
  .mockResolvedValue({ id: 'c1' })
const kindConfig = {
  key: 'clinical' as const,
  i18nNs: 'clinics' as const,
  typeOptions: ['clinic', 'hospital', 'opd'],
  extraBooleanFields: [{ name: 'hasDelivery', label: 'hasDelivery' }],
  extraArrayFields: [{ name: 'departments', label: 'departments' }],
  createFn,
  updateFn: vi.fn(),
}

describe('FacilityFormModal', () => {
  it('requires a name and calls createFn on save', async () => {
    render(<FacilityFormModal open kindConfig={kindConfig} onOpenChange={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Shifa Clinic' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shifa Clinic' })))
  })

  it('renders config-driven boolean checkbox and array input', () => {
    render(<FacilityFormModal open kindConfig={kindConfig} onOpenChange={() => {}} onSaved={() => {}} />)
    // Boolean checkbox for hasDelivery
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    // Array text input for departments (identified by its label)
    expect(screen.getByLabelText('departments')).toBeInTheDocument()
  })

  it('resets name field when modal reopens after a create', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <FacilityFormModal open kindConfig={kindConfig} onOpenChange={onOpenChange} onSaved={() => {}} />
    )
    // Type a name and save
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Shifa Clinic' } })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(createFn).toHaveBeenCalled())

    // Close then reopen — form should reset (name cleared)
    rerender(
      <FacilityFormModal open={false} kindConfig={kindConfig} onOpenChange={onOpenChange} onSaved={() => {}} />
    )
    rerender(
      <FacilityFormModal open kindConfig={kindConfig} onOpenChange={onOpenChange} onSaved={() => {}} />
    )
    expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe('')
  })
})
