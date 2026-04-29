import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'
import type { PrescriptionFormData } from '@/lib/prescription-config'

describe('PrescriptionEntry', () => {
  const onSubmit = vi.fn<(form: PrescriptionFormData) => void>()

  function setup(disabled = false) {
    const user = userEvent.setup()
    const result = render(<PrescriptionEntry onSubmit={onSubmit} disabled={disabled} />)
    return { user, ...result }
  }

  it('renders the medication search input', () => {
    setup()
    expect(screen.getByRole('combobox', { name: /search medications/i })).toBeInTheDocument()
  })

  it('shows autocomplete results on typing', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Amox')
    const listbox = await screen.findByRole('listbox', { name: /medication search results/i })
    const options = within(listbox).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
  })

  it('displays Name, Form, and Strength in search results', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Amoxicillin')
    const listbox = await screen.findByRole('listbox')
    const firstOption = within(listbox).getAllByRole('option')[0]
    expect(firstOption.textContent).toContain('Amoxicillin')
    expect(firstOption.textContent).toContain('500 mg')
    expect(firstOption.textContent).toContain('Capsule')
  })

  it('selects a medication and shows dosage form', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Amoxicillin')
    const listbox = await screen.findByRole('listbox')
    const firstOption = within(listbox).getAllByRole('option')[0]
    await user.click(firstOption)

    // Dosage form should now be visible
    expect(screen.getByLabelText(/dosage quantity/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/frequency/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/duration in days/i)).toBeInTheDocument()
  })

  it('shows frequency options including BID, TID, QD, QID', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Paracetamol')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getAllByRole('option')[0])

    const frequencySelect = screen.getByLabelText(/frequency/i)
    expect(frequencySelect).toBeInTheDocument()
    const options = within(frequencySelect as HTMLElement).getAllByRole('option')
    const optionTexts = options.map((o) => o.textContent)
    expect(optionTexts.some((t) => t?.includes('QD'))).toBe(true)
    expect(optionTexts.some((t) => t?.includes('BID'))).toBe(true)
    expect(optionTexts.some((t) => t?.includes('TID'))).toBe(true)
    expect(optionTexts.some((t) => t?.includes('QID'))).toBe(true)
  })

  it('calls onSubmit with form data when Add Prescription is clicked', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Amoxicillin')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getAllByRole('option')[0])

    await user.click(screen.getByRole('button', { name: /add prescription/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const callArg = onSubmit.mock.calls[0][0]
    expect(callArg.medicationCode).toBeTruthy()
    expect(callArg.medicationDisplay).toBe('Amoxicillin')
    expect(callArg.dosageQuantity).toBeTruthy()
    expect(callArg.frequencyCode).toBeTruthy()
    expect(callArg.durationDays).toBeTruthy()
  })

  it('resets the form after submission', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Amoxicillin')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getAllByRole('option')[0])
    await user.click(screen.getByRole('button', { name: /add prescription/i }))

    // Form should reset — search input should be empty again
    const resetInput = screen.getByRole('combobox', { name: /search medications/i })
    expect(resetInput).toHaveValue('')
    expect(screen.queryByLabelText(/dosage quantity/i)).not.toBeInTheDocument()
  })

  it('supports keyboard navigation in autocomplete', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Amox')

    await screen.findByRole('listbox')

    // Arrow down to first result, then Enter
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    // Medication should be selected — dosage form appears
    await waitFor(() => {
      expect(screen.getByLabelText(/dosage quantity/i)).toBeInTheDocument()
    })
  })

  it('clears medication selection with clear button', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox', { name: /search medications/i })
    await user.type(input, 'Metformin')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getAllByRole('option')[0])

    // Clear button should be visible
    const clearBtn = screen.getByRole('button', { name: /clear selected medication/i })
    await user.click(clearBtn)

    // Should be back to empty search
    expect(screen.getByRole('combobox', { name: /search medications/i })).toHaveValue('')
    expect(screen.queryByLabelText(/dosage quantity/i)).not.toBeInTheDocument()
  })

  it('disables all inputs when disabled prop is true', () => {
    setup(true)
    expect(screen.getByRole('combobox', { name: /search medications/i })).toBeDisabled()
  })
})
