import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PharmacyPicker } from '@/components/clinical/PharmacyPicker'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
const searchMock = vi.fn()
vi.mock('@/lib/pharmacy-search', () => ({ searchPharmacies: (...a: unknown[]) => searchMock(...a) }))

describe('PharmacyPicker', () => {
  it('selecting a result calls onSelect with id and name', async () => {
    searchMock.mockResolvedValue([{ id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', district: 'D10', address: 'Shahr-e Naw', facilityType: 'pharmacy' }])
    const onSelect = vi.fn()
    render(<PharmacyPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kab' } })
    await waitFor(() => screen.getByText('Kabul City Pharmacy'))
    fireEvent.mouseDown(screen.getByText('Kabul City Pharmacy'))
    expect(onSelect).toHaveBeenCalledWith('p1', 'Kabul City Pharmacy')
  })

  it('keyboard ArrowDown + Enter selects the first result', async () => {
    searchMock.mockResolvedValue([{ id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', district: 'D10', address: 'Shahr-e Naw', facilityType: 'pharmacy' }])
    const onSelect = vi.fn()
    render(<PharmacyPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    const combobox = screen.getByRole('combobox')
    fireEvent.change(combobox, { target: { value: 'kab' } })
    await waitFor(() => screen.getByText('Kabul City Pharmacy'))
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('p1', 'Kabul City Pharmacy')
  })

  it('shows the chosen pharmacy as a clearable chip', () => {
    const onClear = vi.fn()
    render(<PharmacyPicker value="p1" name="Kabul City Pharmacy" onSelect={vi.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
