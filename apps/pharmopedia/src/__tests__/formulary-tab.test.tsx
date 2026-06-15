import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { FormularyTab } from '@/components/DrugDetail/FormularyTab'
import type { DrugEntryTier3 } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'formulary.status': 'Formulary status',
      'formulary.onFormulary': 'On BPHS formulary',
      'formulary.offFormulary': 'Off formulary',
      'formulary.restricted': 'Restricted use',
      'formulary.dispensingNotes': 'Dispensing notes',
      'formulary.substitutes': 'Therapeutic substitutes',
      'formulary.noSubstitutes': 'No substitutes listed',
      'formulary.recalls': 'Active recall alerts',
      'formulary.noRecalls': 'No active recall alerts',
    }[key] ?? key),
  }),
}))

// Minimal Tier3 base
const BASE_TIER3: DrugEntryTier3 = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: [],
  doseForms: [],
  therapeuticClass: 'Antibacterials',
  localNames: {},
  summaryPlain: { en: '' },
  usedFor: [],
  commonSideEffects: [],
  whenToSeekHelp: { en: '' },
  storageInstructions: { en: '' },
  pregnancySummaryPlain: { en: '' },
  warningsSummaryPlain: { en: '' },
  version: 1,
  lastUpdated: '2026-06-01T00:00:00Z',
  mechanismOfAction: undefined,
  indicationsClinical: [],
  adultDosing: [],
  pediatricDosing: [],
  renalAdjustment: undefined,
  adverseEvents: [],
  contraindications: [],
  interactions: [],
  pregnancyCategory: undefined,
  administrationNotes: {},
  pharmacokinetics: {},
  formularyStatus: undefined,
  dispensingNotes: undefined,
  substitutes: [],
  recallAlerts: [],
  unitCost: undefined,
}

describe('FormularyTab', () => {
  it('renders "On BPHS formulary" badge when formularyStatus is on_formulary', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, formularyStatus: 'on_formulary' }} />)
    expect(screen.getByText('On BPHS formulary')).toBeTruthy()
  })

  it('renders "Off formulary" badge when formularyStatus is off_formulary', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, formularyStatus: 'off_formulary' }} />)
    expect(screen.getByText('Off formulary')).toBeTruthy()
  })

  it('renders "Restricted use" badge when formularyStatus is restricted', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, formularyStatus: 'restricted' }} />)
    expect(screen.getByText('Restricted use')).toBeTruthy()
  })

  it('renders dispensing notes when present', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, dispensingNotes: 'Shake well before use' }} />)
    expect(screen.getByText('Dispensing notes')).toBeTruthy()
    expect(screen.getByText('Shake well before use')).toBeTruthy()
  })

  it('does not render dispensing notes section when absent', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, dispensingNotes: undefined }} />)
    expect(screen.queryByText('Dispensing notes')).toBeNull()
  })

  it('renders substitute ATC codes list', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, substitutes: ['J01CA01', 'J01CA08'] }} />)
    expect(screen.getByText('Therapeutic substitutes')).toBeTruthy()
    expect(screen.getByText('J01CA01')).toBeTruthy()
    expect(screen.getByText('J01CA08')).toBeTruthy()
  })

  it('renders "No substitutes listed" when substitutes is empty', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, substitutes: [] }} />)
    expect(screen.getByText('No substitutes listed')).toBeTruthy()
  })

  it('renders recall alert description when recalls present', () => {
    render(
      <FormularyTab
        entry={{
          ...BASE_TIER3,
          recallAlerts: [{ recallId: 'RC001', description: 'Contamination risk', initiationDate: '2026-05-01', status: 'Ongoing' }],
        }}
      />
    )
    expect(screen.getByText('Active recall alerts')).toBeTruthy()
    expect(screen.getByText('Contamination risk')).toBeTruthy()
  })

  it('renders "No active recall alerts" when recallAlerts is empty', () => {
    render(<FormularyTab entry={{ ...BASE_TIER3, recallAlerts: [] }} />)
    expect(screen.getByText('No active recall alerts')).toBeTruthy()
  })
})
