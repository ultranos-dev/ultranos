import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InteractionWarningModal } from '@/components/modals/InteractionWarningModal'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { InteractionResult } from '@/services/interactionService'

// next-intl context isn't provided in unit tests; return the key so assertions target keys.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => 'en',
}))

const severeInteraction: InteractionResult = {
  severity: DrugInteractionSeverity.CONTRAINDICATED,
  drugA: 'Warfarin',
  drugB: 'Aspirin',
  description: 'Combined anticoagulant and antiplatelet effect significantly increases bleeding risk',
}

const majorInteraction: InteractionResult = {
  severity: DrugInteractionSeverity.MAJOR,
  drugA: 'Warfarin',
  drugB: 'Ibuprofen',
  description: 'NSAIDs increase anticoagulant effect and risk of GI bleeding with warfarin',
}

const allergyInteraction: InteractionResult = {
  severity: DrugInteractionSeverity.ALLERGY_MATCH,
  drugA: 'Amoxicillin',
  drugB: 'Penicillin allergy',
  description: 'Patient has a documented allergy to this medication class',
}

describe('InteractionWarningModal', () => {
  it('renders when open with interactions', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    expect(screen.getByText('contraindicationDetected')).toBeInTheDocument()
  })

  it('does not render when open is false', () => {
    render(
      <InteractionWarningModal
        open={false}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    expect(screen.queryByText('contraindicationDetected')).not.toBeInTheDocument()
  })

  it('displays the severity label for each interaction', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction, majorInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    expect(screen.getByText('CONTRAINDICATED')).toBeInTheDocument()
    expect(screen.getByText('MAJOR')).toBeInTheDocument()
  })

  it('renders ALLERGY_MATCH with a distinct highest-severity treatment (not MAJOR fallthrough)', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[allergyInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    // The mock returns the key 'severityAllergy', not the raw enum, and not "MAJOR"
    const badge = screen.getByText('severityAllergy')
    expect(badge).toBeInTheDocument()
    expect(screen.queryByText('MAJOR')).not.toBeInTheDocument()
    // Strongest destructive treatment: solid fill via -foreground pair
    expect(badge.className).toMatch(/bg-destructive\b/)
    expect(badge.className).toMatch(/text-destructive-foreground/)
    // An allergy match is a contraindication-tier warning
    expect(screen.getByText('contraindicationDetected')).toBeInTheDocument()
  })

  it('displays the interaction description', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    expect(screen.getByText(/Combined anticoagulant/)).toBeInTheDocument()
  })

  it('displays the interacting drug names', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    expect(screen.getByText(/Warfarin/)).toBeInTheDocument()
    expect(screen.getByText(/Aspirin/)).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={onCancel}
        onOverride={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancelPrescription/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('requires justification text before override is enabled', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    const overrideBtn = screen.getByRole('button', { name: /proceedAnyway/i })
    expect(overrideBtn).toBeDisabled()
  })

  it('enables override button after justification is entered', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    const input = screen.getByPlaceholderText(/justificationPlaceholder/i)
    fireEvent.change(input, { target: { value: 'Benefit outweighs risk for this patient' } })
    const overrideBtn = screen.getByRole('button', { name: /proceedAnyway/i })
    expect(overrideBtn).not.toBeDisabled()
  })

  it('calls onOverride with justification when proceed is clicked', () => {
    const onOverride = vi.fn()
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={onOverride}
      />,
    )
    const input = screen.getByPlaceholderText(/justificationPlaceholder/i)
    fireEvent.change(input, { target: { value: 'Patient needs both medications' } })
    fireEvent.click(screen.getByRole('button', { name: /proceedAnyway/i }))
    expect(onOverride).toHaveBeenCalledWith('Patient needs both medications')
  })

  it('uses high-contrast styling (red/danger theme)', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    const heading = screen.getByText('contraindicationDetected')
    expect(heading.className).toMatch(/destructive|danger/i)
  })

  it('has role=dialog for accessibility', () => {
    render(
      <InteractionWarningModal
        open={true}
        interactions={[severeInteraction]}
        onCancel={vi.fn()}
        onOverride={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
