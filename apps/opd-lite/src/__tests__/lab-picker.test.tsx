import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LabPicker } from '@/components/clinical/LabPicker'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'en' }))
const searchMock = vi.fn()
vi.mock('@/lib/lab-search', () => ({ searchLabs: (...a: unknown[]) => searchMock(...a) }))

const CENTRAL = { id: 'lab1', name: 'Central Lab', accreditationRef: 'ACC-1', status: 'ACTIVE' }
const result = (item = CENTRAL, matches?: unknown) => ({ item, matches })

describe('LabPicker', () => {
  it('selecting a result calls onSelect with id and name', async () => {
    searchMock.mockResolvedValue([result()])
    const onSelect = vi.fn()
    render(<LabPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cent' } })
    await waitFor(() => screen.getByText('Central Lab'))
    fireEvent.mouseDown(screen.getByText('Central Lab'))
    expect(onSelect).toHaveBeenCalledWith('lab1', 'Central Lab')
  })

  it('keyboard ArrowDown + Enter selects the first result', async () => {
    searchMock.mockResolvedValue([result()])
    const onSelect = vi.fn()
    render(<LabPicker value={undefined} name={undefined} onSelect={onSelect} onClear={vi.fn()} />)
    const combobox = screen.getByRole('combobox')
    fireEvent.change(combobox, { target: { value: 'cent' } })
    await waitFor(() => screen.getByText('Central Lab'))
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    fireEvent.keyDown(combobox, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('lab1', 'Central Lab')
  })

  it('highlights the matched characters in the result name', async () => {
    searchMock.mockResolvedValue([result(CENTRAL, [{ key: 'name', value: 'Central Lab', indices: [[0, 2]] }])])
    const { container } = render(<LabPicker value={undefined} name={undefined} onSelect={vi.fn()} onClear={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cen' } })
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull())
    expect(container.querySelector('mark')!.textContent).toBe('Cen')
  })

  it('shows the chosen lab as a clearable chip', () => {
    const onClear = vi.fn()
    render(<LabPicker value="lab1" name="Central Lab" onSelect={vi.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
