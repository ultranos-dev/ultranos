/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Task 9.9: RTL snapshot tests for ResultColorIndicator, AudioResultPlayer,
 *           and PatientResultSummary in both LTR and RTL modes
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/audio-result-scripts', () => ({
  resolveAudioScript: () => ({
    id: 'cbc-normal',
    testCategory: '58410-2',
    resultField: 'cbc',
    interpretation: 'normal',
    version: '1.0.0',
    approvedBy: '',
    approvedAt: '',
    audioFiles: { en: '', ar: '', prs: '', ps: '' },
    plainTextScripts: {
      en: 'Your blood count is normal.',
      ar: 'تعداد دمك طبيعي.',
      prs: 'شمارش خون شما نرمال است.',
      ps: 'ستاسو د وینې شمیرنه نورمال ده.',
    },
  }),
  isScriptApproved: () => false,
}))

afterEach(() => {
  document.dir = 'ltr'
})

// Import AFTER mocks
import { ResultColorIndicator } from '../components/results/ResultColorIndicator'
import { AudioResultPlayer } from '../components/results/AudioResultPlayer'
import { PatientResultSummary } from '../components/results/PatientResultSummary'
import type { PatientResult } from '../components/results/PatientResultSummary'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESULTS: PatientResult[] = [
  { resultField: 'cbc', testCategory: '58410-2', interpretation: 'normal' },
  { resultField: 'lipidPanel', testCategory: '57698-3', interpretation: 'low' },
]

// ---------------------------------------------------------------------------
// 9.9 — ResultColorIndicator — LTR and RTL snapshots
// ---------------------------------------------------------------------------

describe('ResultColorIndicator — LTR/RTL snapshots', () => {
  it('renders correctly in LTR mode', () => {
    document.dir = 'ltr'
    const { container } = render(
      <ResultColorIndicator interpretation="normal" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders correctly in RTL mode', () => {
    document.dir = 'rtl'
    const { container } = render(
      <ResultColorIndicator interpretation="normal" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders critical-low correctly in RTL mode', () => {
    document.dir = 'rtl'
    const { container } = render(
      <ResultColorIndicator interpretation="critical-low" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders high correctly in LTR mode', () => {
    document.dir = 'ltr'
    const { container } = render(
      <ResultColorIndicator interpretation="high" />,
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// 9.9 — AudioResultPlayer — LTR and RTL snapshots
// ---------------------------------------------------------------------------

describe('AudioResultPlayer — LTR/RTL snapshots', () => {
  it('renders fallback player in LTR mode', () => {
    document.dir = 'ltr'
    const { container } = render(
      <AudioResultPlayer
        testCategory="58410-2"
        resultField="cbc"
        interpretation="normal"
        locale="en"
      />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders fallback player in RTL mode (ar locale)', () => {
    document.dir = 'rtl'
    const { container } = render(
      <AudioResultPlayer
        testCategory="58410-2"
        resultField="cbc"
        interpretation="normal"
        locale="ar"
      />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders fallback player in RTL mode (prs locale)', () => {
    document.dir = 'rtl'
    const { container } = render(
      <AudioResultPlayer
        testCategory="58410-2"
        resultField="cbc"
        interpretation="normal"
        locale="prs"
      />,
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// 9.9 — PatientResultSummary — LTR and RTL snapshots
// ---------------------------------------------------------------------------

describe('PatientResultSummary — LTR/RTL snapshots', () => {
  it('renders in LTR mode', () => {
    document.dir = 'ltr'
    const { container } = render(
      <PatientResultSummary results={RESULTS} locale="en" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL mode (ar locale)', () => {
    document.dir = 'rtl'
    const { container } = render(
      <PatientResultSummary results={RESULTS} locale="ar" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL mode (prs locale)', () => {
    document.dir = 'rtl'
    const { container } = render(
      <PatientResultSummary results={RESULTS} locale="prs" />,
    )
    expect(container).toMatchSnapshot()
  })

  it('renders in RTL mode (ps locale)', () => {
    document.dir = 'rtl'
    const { container } = render(
      <PatientResultSummary results={RESULTS} locale="ps" />,
    )
    expect(container).toMatchSnapshot()
  })
})
