import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/lib/trpc', () => ({ searchDrugCatalog: vi.fn(), enrichDrug: vi.fn() }))

const searchMock = vi.fn()
vi.mock('@/lib/medication-search', () => ({ searchMedications: (...a: unknown[]) => searchMock(...a) }))

function presentationRow(overrides: Record<string, unknown> = {}) {
  return {
    item: {
      code: 'J01CA04',
      display: 'Amoxicillin',
      form: 'Capsule',
      strength: '500 mg',
      brandName: 'Amoxil',
      manufacturer: 'GSK',
      route: 'PO',
      presentationId: 'p1',
      ...overrides,
    },
    matches: undefined,
  }
}

async function selectFirstRow() {
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'amox' } })
  await waitFor(() => screen.getByText('Amoxicillin'))
  fireEvent.mouseDown(screen.getByText('Amoxicillin'))
  await waitFor(() => screen.getByRole('link', { name: /pharmopedia/i }))
}

describe('PrescriptionEntry — presentation selection', () => {
  it('fills strength, form, route, brand, and manufacturer from the selected presentation', async () => {
    searchMock.mockResolvedValue([presentationRow()])
    const onSubmit = vi.fn()
    render(<PrescriptionEntry onSubmit={onSubmit} />)
    await selectFirstRow()

    fireEvent.click(screen.getByRole('button', { name: 'addPrescription' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const form = onSubmit.mock.calls[0]![0]
    expect(form.medicationStrength).toBe('500 mg')
    expect(form.medicationForm).toBe('Capsule')
    expect(form.route).toBe('PO')
    expect(form.brandHint).toBe('Amoxil')
    expect(form.medicationManufacturer).toBe('GSK')
  })

  it('renders a Route select reflecting the selected presentation route', async () => {
    searchMock.mockResolvedValue([presentationRow()])
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectFirstRow()

    const routeSelect = screen.getByLabelText('route') as HTMLSelectElement
    expect(routeSelect.value).toBe('PO')
  })

  it('infers the route from the dose form when the presentation has none', async () => {
    searchMock.mockResolvedValue([presentationRow({ route: undefined, form: 'Inhaler', strength: '' })])
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectFirstRow()

    const routeSelect = screen.getByLabelText('route') as HTMLSelectElement
    expect(routeSelect.value).toBe('INHALED')
  })

  it('exposes an editable strength field prefilled from the selection', async () => {
    searchMock.mockResolvedValue([presentationRow()])
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectFirstRow()

    const strengthInput = screen.getByLabelText('strength') as HTMLInputElement
    expect(strengthInput.value).toBe('500 mg')
    fireEvent.change(strengthInput, { target: { value: '250 mg' } })
    expect(strengthInput.value).toBe('250 mg')
  })
})
