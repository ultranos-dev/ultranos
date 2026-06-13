import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'drug.overview.summary': 'Summary',
      'drug.overview.usedFor': 'Used for',
      'drug.overview.sideEffects': 'Common side effects',
      'drug.overview.seekHelp': 'When to seek help',
      'drug.overview.storage': 'Storage',
      'drug.overview.pregnancy': 'Pregnancy',
      'drug.overview.warnings': 'Warnings',
    }[key] ?? key),
  }),
}))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: () => false,
}))

const ENTRY: DrugEntryTier1 = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg'],
  brandNames: [],
  localNames: {},
  summaryPlain: { en: 'A broad-spectrum antibiotic.' },
  usedFor: [{ en: 'Bacterial infections' }],
  commonSideEffects: [{ en: 'Nausea' }],
  whenToSeekHelp: { en: 'Severe rash' },
  storageInstructions: { en: 'Room temperature' },
  pregnancySummaryPlain: { en: 'Category B' },
  warningsSummaryPlain: { en: 'Allergy risk' },
  version: 1,
  lastUpdated: '2026-06-13T00:00:00Z',
}

describe('OverviewTab — i18n section titles', () => {
  it('renders Summary section title from t()', () => {
    render(<OverviewTab entry={ENTRY} lang="en" />)
    expect(screen.getByText('Summary')).toBeTruthy()
  })

  it('renders Used for section', () => {
    render(<OverviewTab entry={ENTRY} lang="en" />)
    expect(screen.getByText('Used for')).toBeTruthy()
  })
})
