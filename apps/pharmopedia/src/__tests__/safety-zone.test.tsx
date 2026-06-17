import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { SafetyZone } from '@/components/DrugDetail/SafetyZone'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', danger: '#dc2626', dangerLight: '#fef2f2',
    dangerDark: '#991b1b', warning: '#d97706', warningLight: '#fffbeb', warningDark: '#92400e',
  }),
}))

const base = {
  atcCode: 'M01AE01', innName: 'Ibuprofen', brandNames: [], doseForms: [], therapeuticClass: 'NSAID',
  localNames: {}, summaryPlain: {}, usedFor: [], commonSideEffects: [],
  whenToSeekHelp: { en: 'Seek help if breathing is hard' },
  storageInstructions: {}, pregnancySummaryPlain: {}, warningsSummaryPlain: { en: 'May cause stomach bleeding' },
  version: 1, lastUpdated: '2026-06-17T00:00:00Z',
}

describe('SafetyZone', () => {
  it('renders warnings + seek-help for all roles, with no collapse control', () => {
    render(<SafetyZone entry={base} lang="en" isClinical={false} />)
    const zone = screen.getByTestId('safety-zone')
    expect(zone.props.accessibilityRole).toBe('alert')
    expect(screen.getByText('May cause stomach bleeding')).toBeTruthy()
    expect(screen.getByText('Seek help if breathing is hard')).toBeTruthy()
    // no expandable button inside the safety zone
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('includes contraindicated interactions for clinical roles', () => {
    const clinical = { ...base, interactions: [
      { drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'CONTRAINDICATED', mechanism: 'bleeding risk' },
    ], contraindications: ['Active GI bleed'] } as unknown as DrugEntryTier2
    render(<SafetyZone entry={clinical} lang="en" isClinical />)
    expect(screen.getByText(/Warfarin/)).toBeTruthy()
    expect(screen.getByText(/Active GI bleed/)).toBeTruthy()
  })

  it('renders nothing when there is no safety content', () => {
    const empty = { ...base, whenToSeekHelp: {}, warningsSummaryPlain: {} }
    render(<SafetyZone entry={empty} lang="en" isClinical={false} />)
    expect(screen.queryByTestId('safety-zone')).toBeNull()
  })

  // Migrated from safety-banner.test.tsx: MAJOR interactions coverage
  it('renders MAJOR interactions for clinical roles', () => {
    const clinical = { ...base, interactions: [
      { drugAtcCode: 'C09AA01', drugName: 'Enalapril', severity: 'MAJOR', mechanism: 'Hyperkalaemia' },
    ] } as unknown as DrugEntryTier2
    render(<SafetyZone entry={clinical} lang="en" isClinical />)
    expect(screen.getByText(/Enalapril/)).toBeTruthy()
    expect(screen.getByText(/Hyperkalaemia/)).toBeTruthy()
  })

  // Migrated from safety-banner.test.tsx: MODERATE interactions must NOT appear in safety zone
  it('does not render MODERATE interactions (below threshold)', () => {
    const clinical = { ...base, whenToSeekHelp: {}, warningsSummaryPlain: {}, interactions: [
      { drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MODERATE', mechanism: 'Minor risk' },
    ] } as unknown as DrugEntryTier2
    render(<SafetyZone entry={clinical} lang="en" isClinical />)
    expect(screen.queryByTestId('safety-zone')).toBeNull()
  })

  // Migrated from safety-banner.test.tsx: accessibilityRole alert on safety content
  it('has accessibilityRole alert when safety content is present', () => {
    const clinical = { ...base, interactions: [
      { drugAtcCode: 'L04AX03', drugName: 'Methotrexate', severity: 'CONTRAINDICATED', mechanism: 'Toxic' },
    ] } as unknown as DrugEntryTier2
    render(<SafetyZone entry={clinical} lang="en" isClinical />)
    expect(screen.getByTestId('safety-zone').props.accessibilityRole).toBe('alert')
  })

  it('orders CONTRAINDICATED interactions before MAJOR', () => {
    const clinical = { ...base, interactions: [
      { drugAtcCode: 'X', drugName: 'MajorDrug', severity: 'MAJOR', mechanism: 'major mech' },
      { drugAtcCode: 'Y', drugName: 'ContraDrug', severity: 'CONTRAINDICATED', mechanism: 'contra mech' },
    ] } as unknown as import('@ultranos/shared-types').DrugEntryTier2
    const { toJSON } = render(<SafetyZone entry={clinical} lang="en" isClinical />)
    const out = JSON.stringify(toJSON())
    expect(out.indexOf('ContraDrug')).toBeLessThan(out.indexOf('MajorDrug'))
    expect(out.indexOf('ContraDrug')).toBeGreaterThan(-1)
  })
})
