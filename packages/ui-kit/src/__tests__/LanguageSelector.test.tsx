import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSelector } from '../components/LanguageSelector'
import type { SupportedLocale } from '../hooks/useAppLocale'

describe('LanguageSelector', () => {
  const mockOnLocaleChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a globe button with correct aria-label', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    const button = screen.getByRole('button', { name: /change language/i })
    expect(button).toBeDefined()
  })

  it('opens dropdown on click showing all three languages', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    const button = screen.getByRole('button', { name: /change language/i })
    fireEvent.click(button)

    expect(screen.getByText('English')).toBeDefined()
    expect(screen.getByText('العربية')).toBeDefined()
    expect(screen.getByText('دری')).toBeDefined()
  })

  it('uses listbox role with option roles for each language', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))

    expect(screen.getByRole('listbox')).toBeDefined()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
  })

  it('marks current locale as selected (aria-selected)', () => {
    render(
      <LanguageSelector
        currentLocale="ar"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))

    const options = screen.getAllByRole('option')
    const arabicOption = options.find((o) => o.textContent?.includes('العربية'))
    expect(arabicOption?.getAttribute('aria-selected')).toBe('true')

    const englishOption = options.find((o) => o.textContent?.includes('English'))
    expect(englishOption?.getAttribute('aria-selected')).toBe('false')
  })

  it('calls onLocaleChange with selected locale and closes dropdown', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))
    fireEvent.click(screen.getByText('العربية'))

    expect(mockOnLocaleChange).toHaveBeenCalledWith('ar')
    // Dropdown should close
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes dropdown on Escape key', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))
    expect(screen.getByRole('listbox')).toBeDefined()

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('supports keyboard navigation with arrow keys', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    const button = screen.getByRole('button', { name: /change language/i })
    fireEvent.click(button)

    const listbox = screen.getByRole('listbox')
    const options = screen.getAllByRole('option')

    // Focus should start on current locale (English)
    expect(document.activeElement).toBe(options[0])

    // ArrowDown moves to next option
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options[1])

    // ArrowDown again
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options[2])

    // ArrowDown wraps around
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options[0])

    // ArrowUp wraps to last
    fireEvent.keyDown(listbox, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(options[2])
  })

  it('selects language on Enter key', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))

    const listbox = screen.getByRole('listbox')
    // Move to Arabic
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    // Select with Enter
    fireEvent.keyDown(listbox, { key: 'Enter' })

    expect(mockOnLocaleChange).toHaveBeenCalledWith('ar')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens dropdown with Enter key on button', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    const button = screen.getByRole('button', { name: /change language/i })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(screen.getByRole('listbox')).toBeDefined()
  })

  it('opens dropdown with Space key on button', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    const button = screen.getByRole('button', { name: /change language/i })
    fireEvent.keyDown(button, { key: ' ' })
    expect(screen.getByRole('listbox')).toBeDefined()
  })

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <span data-testid="outside">Outside</span>
        <LanguageSelector
          currentLocale="en"
          onLocaleChange={mockOnLocaleChange}
        />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))
    expect(screen.getByRole('listbox')).toBeDefined()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not call onLocaleChange when selecting already-active locale', () => {
    render(
      <LanguageSelector
        currentLocale="en"
        onLocaleChange={mockOnLocaleChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /change language/i }))
    fireEvent.click(screen.getByText('English'))

    expect(mockOnLocaleChange).not.toHaveBeenCalled()
  })
})
