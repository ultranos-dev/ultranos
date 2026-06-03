/**
 * Story 47.5 — Spill & Decontamination Protocol: SpillTypeSelector Tests
 * Task 10.3 — Component tests for SpillTypeSelector
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpillTypeSelector } from '../components/safety/SpillTypeSelector'
import { SpillType } from '../types/spill-protocol'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'safety.spill.selector.title': 'Spill Emergency',
      'safety.spill.selector.subtitle': 'What spilled?',
      'safety.spill.selector.riskLabel': 'Risk',
      'safety.spill.selector.cancel': 'Cancel',
      'safety.spill.types.urine': 'Urine',
      'safety.spill.types.bloodserum': 'Blood / Serum',
      'safety.spill.types.chemicalreagent': 'Chemical / Reagent',
      'safety.spill.types.culturemicrobiology': 'Culture / Microbiology',
      'safety.spill.riskTiers.low': 'LOW',
      'safety.spill.riskTiers.moderate': 'MODERATE',
      'safety.spill.riskTiers.high': 'HIGH',
      'safety.spill.riskTiers.critical': 'CRITICAL',
    }
    return translations[key] ?? key
  },
}))

const mockOnSelect = vi.fn()
const mockOnClose = vi.fn()

function renderSelector() {
  return render(
    <SpillTypeSelector onSelect={mockOnSelect} onClose={mockOnClose} />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpillTypeSelector', () => {
  it('renders all 4 spill type buttons', () => {
    renderSelector()
    expect(screen.getByText('Urine')).toBeInTheDocument()
    expect(screen.getByText('Blood / Serum')).toBeInTheDocument()
    expect(screen.getByText('Chemical / Reagent')).toBeInTheDocument()
    expect(screen.getByText('Culture / Microbiology')).toBeInTheDocument()
  })

  it('renders risk tier labels for each button', () => {
    renderSelector()
    expect(screen.getByText(/LOW/)).toBeInTheDocument()
    expect(screen.getByText(/MODERATE/)).toBeInTheDocument()
    expect(screen.getByText(/HIGH/)).toBeInTheDocument()
    expect(screen.getByText(/CRITICAL/)).toBeInTheDocument()
  })

  it('calls onSelect with URINE when urine button is clicked', () => {
    renderSelector()
    fireEvent.click(screen.getByText('Urine'))
    expect(mockOnSelect).toHaveBeenCalledWith(SpillType.URINE)
  })

  it('calls onSelect with BLOOD_SERUM when blood button is clicked', () => {
    renderSelector()
    fireEvent.click(screen.getByText('Blood / Serum'))
    expect(mockOnSelect).toHaveBeenCalledWith(SpillType.BLOOD_SERUM)
  })

  it('calls onSelect with CHEMICAL_REAGENT when chemical button is clicked', () => {
    renderSelector()
    fireEvent.click(screen.getByText('Chemical / Reagent'))
    expect(mockOnSelect).toHaveBeenCalledWith(SpillType.CHEMICAL_REAGENT)
  })

  it('calls onSelect with CULTURE_MICROBIOLOGY when culture button is clicked', () => {
    renderSelector()
    fireEvent.click(screen.getByText('Culture / Microbiology'))
    expect(mockOnSelect).toHaveBeenCalledWith(SpillType.CULTURE_MICROBIOLOGY)
  })

  it('calls onClose when cancel button is clicked', () => {
    renderSelector()
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('renders as a modal dialog with aria-modal', () => {
    const { container } = renderSelector()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('has minimum 64px touch targets on all spill buttons', () => {
    const { container } = renderSelector()
    const buttons = container.querySelectorAll('button[type="button"]')
    // Spill type buttons (first 4) should have minHeight 64px
    const spillButtons = Array.from(buttons).slice(0, 4)
    spillButtons.forEach((btn) => {
      const style = (btn as HTMLElement).style
      expect(style.minHeight).toBe('64px')
    })
  })

  it('has dir=auto for RTL support', () => {
    const { container } = renderSelector()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).toHaveAttribute('dir', 'auto')
  })

  describe('Risk tier color coding', () => {
    it('CRITICAL (culture) button uses red background', () => {
      const { container } = renderSelector()
      // Culture/Microbiology is the last spill button (red)
      const buttons = container.querySelectorAll('button[type="button"]')
      const cultureButton = Array.from(buttons).find(
        (b) => b.textContent?.includes('Culture / Microbiology'),
      ) as HTMLElement
      expect(cultureButton).toBeDefined()
      expect(cultureButton.style.backgroundColor).toBe('rgb(220, 38, 38)')
    })

    it('LOW (urine) button uses blue background', () => {
      const { container } = renderSelector()
      const buttons = container.querySelectorAll('button[type="button"]')
      const urineButton = Array.from(buttons).find(
        (b) => b.textContent?.includes('Urine'),
      ) as HTMLElement
      expect(urineButton).toBeDefined()
      expect(urineButton.style.backgroundColor).toBe('rgb(29, 78, 216)')
    })
  })
})
