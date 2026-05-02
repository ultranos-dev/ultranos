import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiagnosisSearch } from '@/components/clinical/diagnosis-search'
import { seedVocabularyIfEmpty } from '@/lib/vocabulary-seeder'

beforeAll(async () => {
  await seedVocabularyIfEmpty()
})

describe('DiagnosisSearch', () => {
  const mockOnSelect = vi.fn()

  it('renders the search input and rank toggle', () => {
    render(<DiagnosisSearch onSelect={mockOnSelect} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /primary/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /secondary/i })).toBeInTheDocument()
  })

  it('shows results when typing a valid query', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'diabetes')

    const listbox = await screen.findByRole('listbox')
    expect(listbox).toBeInTheDocument()
    const options = within(listbox).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
  })

  it('shows both ICD-10 code and clinical name in results', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    await user.type(screen.getByRole('combobox'), 'hypertension')

    const listbox = await screen.findByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    // First result should contain an ICD code and the word hypertension
    expect(options[0].textContent).toMatch(/[A-Z]\d/)
    expect(options[0].textContent).toMatch(/hypertens/i)
  })

  it('does not show results for single character', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    await user.type(screen.getByRole('combobox'), 'a')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('calls onSelect with item and rank when clicking a result', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    await user.type(screen.getByRole('combobox'), 'fever')

    const listbox = await screen.findByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    await user.click(options[0])

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'R50.9' }),
      'primary',
    )
  })

  it('sends secondary rank when secondary is selected', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    await user.click(screen.getByRole('radio', { name: /secondary/i }))

    await user.type(screen.getByRole('combobox'), 'fever')

    const listbox = await screen.findByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    await user.click(options[0])

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'R50.9' }),
      'secondary',
    )
  })

  it('clears the input after selection', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'fever')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getAllByRole('option')[0])

    expect(input).toHaveValue('')
  })

  it('navigates results with arrow keys', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'acute')

    await screen.findByRole('listbox')

    await user.keyboard('{ArrowDown}')
    const firstOption = screen.getAllByRole('option')[0]
    expect(firstOption).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    await waitFor(() => {
      const secondOption = screen.getAllByRole('option')[1]
      expect(secondOption).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('selects with Enter key', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    await user.type(screen.getByRole('combobox'), 'pneumonia')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.any(String) }),
      'primary',
    )
  })

  it('closes dropdown on Escape', async () => {
    const user = userEvent.setup()
    render(<DiagnosisSearch onSelect={mockOnSelect} />)

    await user.type(screen.getByRole('combobox'), 'diabetes')
    await screen.findByRole('listbox')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  it('disables input when disabled prop is true', () => {
    render(<DiagnosisSearch onSelect={mockOnSelect} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  describe('RTL support', () => {
    it('renders correctly in RTL direction', () => {
      const { container } = render(
        <div dir="rtl">
          <DiagnosisSearch onSelect={mockOnSelect} />
        </div>,
      )
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.getAttribute('dir')).toBe('rtl')
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /primary/i })).toBeInTheDocument()
    })

    it('matches LTR snapshot', () => {
      const { container } = render(
        <div dir="ltr">
          <DiagnosisSearch onSelect={mockOnSelect} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches RTL snapshot', () => {
      const { container } = render(
        <div dir="rtl">
          <DiagnosisSearch onSelect={mockOnSelect} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })
})
