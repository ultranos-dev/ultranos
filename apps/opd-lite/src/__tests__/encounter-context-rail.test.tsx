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
