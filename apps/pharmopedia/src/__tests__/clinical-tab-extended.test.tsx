import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import type { DrugEntryTier2 } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'drug.clinical.mechanism': 'Mechanism of action',
      'drug.clinical.indications': 'Clinical indications',
      'drug.clinical.contraindications': 'Contraindications',
      'drug.clinical.adverseEvents': 'Adverse events',
      'drug.clinical.adultDosing': 'Adult dosing',
      'drug.clinical.pregnancyCategory': 'Pregnancy category',
      'drug.clinical.renalAdjustment': 'Renal adjustment',
      'drug.clinical.interactions': 'Drug interactions',
      'drug.clinical.pediatricDosing': 'Pediatric dosing',
      'drug.clinical.adminNotes': 'Administration notes',
      'drug.clinical.pharmacokinetics': 'Pharmacokinetics',
      'drug.clinical.halfLife': 'Half-life',
      'drug.clinical.proteinBinding': 'Protein binding',
      'drug.clinical.volumeDistribution': 'Volume of distribution',
      'drug.clinical.metabolism': 'Metabolism',
      'drug.clinical.excretion': 'Excretion',
      'drug.clinical.severity.CONTRAINDICATED': 'Contraindicated',
      'drug.clinical.severity.MAJOR': 'Major',
      'drug.clinical.severity.MODERATE': 'Moderate',
      'drug.clinical.severity.MINOR': 'Minor',
    }[key] ?? key),
  }),
}))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: () => false,
}))

// Minimal Tier2 base — all arrays empty, all optionals absent
const BASE: DrugEntryTier2 = {
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
}

describe('ClinicalTab — interactions section', () => {
  it('renders interaction drug name and severity badge', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      interactions: [
        { drugAtcCode: 'J01GB06', drugName: 'Gentamicin', severity: 'MAJOR', mechanism: 'Combined nephrotoxicity' },
      ],
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Gentamicin')).toBeTruthy()
    expect(screen.getByText('Major')).toBeTruthy()
    expect(screen.getByText('Combined nephrotoxicity')).toBeTruthy()
  })

  it('renders CONTRAINDICATED severity badge for contraindicated interactions', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      interactions: [
        { drugAtcCode: 'B01AC06', drugName: 'Aspirin', severity: 'CONTRAINDICATED', mechanism: 'Increased bleeding risk' },
      ],
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Contraindicated')).toBeTruthy()
  })

  it('does not render interactions section when list is empty', () => {
    render(<ClinicalTab entry={{ ...BASE, interactions: [] }} lang="en" />)
    expect(screen.queryByText('Drug interactions')).toBeNull()
  })
})

describe('ClinicalTab — pharmacokinetics section', () => {
  it('renders half-life and protein binding', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      pharmacokinetics: { halfLifeHours: 1.3, proteinBindingPct: 17 },
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Pharmacokinetics')).toBeTruthy()
    expect(screen.getByText(/1\.3/)).toBeTruthy()
    expect(screen.getByText(/17/)).toBeTruthy()
  })

  it('does not render pharmacokinetics section when all PK fields are absent', () => {
    render(<ClinicalTab entry={{ ...BASE, pharmacokinetics: {} }} lang="en" />)
    expect(screen.queryByText('Pharmacokinetics')).toBeNull()
  })
})

describe('ClinicalTab — pediatric dosing section', () => {
  it('renders pediatric dosing rows', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      pediatricDosing: [
        { indication: 'Otitis media', pediatricDose: '40mg/kg/day', frequency: 'divided TID', route: 'oral' },
      ],
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Pediatric dosing')).toBeTruthy()
    expect(screen.getByText(/Otitis media/)).toBeTruthy()
    expect(screen.getByText(/40mg\/kg\/day/)).toBeTruthy()
  })
})

describe('ClinicalTab — administration notes section', () => {
  it('renders localized administrationNotes for the selected lang', () => {
    const entry: DrugEntryTier2 = {
      ...BASE,
      administrationNotes: { en: 'Take with food', prs: 'با غذا بخورید' },
    }
    render(<ClinicalTab entry={entry} lang="en" />)
    expect(screen.getByText('Administration notes')).toBeTruthy()
    expect(screen.getByText('Take with food')).toBeTruthy()
  })

  it('does not render administration notes section when empty', () => {
    render(<ClinicalTab entry={{ ...BASE, administrationNotes: {} }} lang="en" />)
    expect(screen.queryByText('Administration notes')).toBeNull()
  })
})
