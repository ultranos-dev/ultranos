import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InteractionWarningModal } from '@/components/modals/InteractionWarningModal'
import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { InteractionResult } from '@/services/interactionService'

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
    expect(screen.getByText(/Contraindication Detected/i)).toBeInTheDocument()
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
    expect(screen.queryByText(/Contraindication Detected/i)).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
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
    const overrideBtn = screen.getByRole('button', { name: /proceed anyway/i })
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
    const input = screen.getByPlaceholderText(/justification/i)
    fireEvent.change(input, { target: { value: 'Benefit outweighs risk for this patient' } })
    const overrideBtn = screen.getByRole('button', { name: /proceed anyway/i })
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
    const input = screen.getByPlaceholderText(/justification/i)
    fireEvent.change(input, { target: { value: 'Patient needs both medications' } })
    fireEvent.click(screen.getByRole('button', { name: /proceed anyway/i }))
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
    const heading = screen.getByText(/Contraindication Detected/i)
    expect(heading.className).toMatch(/red|danger/i)
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
