import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => 'en',
}))

import { EncounterContextRail } from '../components/encounter/EncounterContextRail'

const patient = { display: 'Test Patient', ageSex: '34y / F', idSlice: '…4821' }

describe('EncounterContextRail', () => {
  it('renders interaction-chip with destructive class when status is BLOCKED', () => {
    render(
      <EncounterContextRail
        patient={patient}
        allergies={['Penicillin']}
        interactionStatus="BLOCKED"
        activeMeds={[]}
      />,
    )
    const chip = screen.getByTestId('interaction-chip')
    expect(chip.className).toMatch(/destructive/)
  })

  it('lists allergy chips when allergies are provided', () => {
    render(
      <EncounterContextRail
        patient={patient}
        allergies={['Penicillin']}
        interactionStatus="CLEAR"
        activeMeds={[]}
      />,
    )
    expect(screen.getByText('Penicillin')).toBeInTheDocument()
  })

  it('renders a neutral chip (not the UNAVAILABLE failure label) when no check has run', () => {
    // Safety rule #3: UNAVAILABLE means a check ran and FAILED. `null` means no
    // prescription has been checked yet — it must NOT masquerade as a failure.
    render(
      <EncounterContextRail
        patient={patient}
        allergies={[]}
        interactionStatus={null}
        activeMeds={[]}
      />,
    )
    const chip = screen.getByTestId('interaction-chip')
    expect(chip).toHaveTextContent('railNoneRecorded')
    expect(chip).not.toHaveTextContent('interactionStatusUnavailable')
    expect(chip.className).not.toMatch(/destructive|warning/)
  })

  it('still renders the UNAVAILABLE warning when a check actually failed', () => {
    render(
      <EncounterContextRail
        patient={patient}
        allergies={[]}
        interactionStatus="UNAVAILABLE"
        activeMeds={[]}
      />,
    )
    expect(screen.getByTestId('interaction-chip')).toHaveTextContent('interactionStatusUnavailable')
  })

  it('renders no-known-allergies fallback with empty allergies list', () => {
    render(
      <EncounterContextRail
        patient={patient}
        allergies={[]}
        interactionStatus="CLEAR"
        activeMeds={[]}
      />,
    )
    // next-intl mock returns key as value
    expect(screen.getByText('railNoKnownAllergies')).toBeInTheDocument()
  })
})
