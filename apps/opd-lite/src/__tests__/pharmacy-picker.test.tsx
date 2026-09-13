import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PharmacyPicker } from '@/components/clinical/PharmacyPicker'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
const searchMock = vi.fn()
vi.mock('@/lib/pharmacy-search', () => ({ searchPharmacies: (...a: unknown[]) => searchMock(...a) }))

const KABUL = { id: 'p1', name: 'Kabul City Pharmacy', province: 'Kabul', district: 'D10', address: 'Shahr-e Naw', facilityType: 'pharmacy' as const }
const result = (item = KABUL, matches?: unknown) => ({ item, matches })

describe('PharmacyPicker', () => {
  it('selecting a result calls onSelect with id and name', async () => {
    searchMock.mockResolvedValue([result()])
    const onSelect = vi.fn()
    render(<PharmacyPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kab' } })
    await waitFor(() => screen.getByText('Kabul City Pharmacy'))
    fireEvent.mouseDown(screen.getByText('Kabul City Pharmacy'))
    expect(onSelect).toHaveBeenCalledWith('p1', 'Kabul City Pharmacy')
  })

  it('keyboard ArrowDown + Enter selects the first result', async () => {
    searchMock.mockResolvedValue([result()])
    const onSelect = vi.fn()
    render(<PharmacyPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    const combobox = screen.getByRole('combobox')
    fireEvent.change(combobox, { target: { value: 'kab' } })
    await waitFor(() => screen.getByText('Kabul City Pharmacy'))
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('p1', 'Kabul City Pharmacy')
  })

  it('highlights the matched characters in the result name', async () => {
    searchMock.mockResolvedValue([result(KABUL, [{ key: 'name', value: 'Kabul City Pharmacy', indices: [[0, 2]] }])])
    const { container } = render(<PharmacyPicker value={undefined} name={undefined} onSelect={vi.fn()} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kab' } })
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull())
    expect(container.querySelector('mark')!.textContent).toBe('Kab')
  })

  it('shows the chosen pharmacy as a clearable chip', () => {
    const onClear = vi.fn()
    render(<PharmacyPicker value="p1" name="Kabul City Pharmacy" onSelect={vi.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
