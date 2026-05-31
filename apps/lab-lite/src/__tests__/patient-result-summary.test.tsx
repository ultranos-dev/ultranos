/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Tasks 9.6, 9.7, 9.8: PatientResultSummary component tests
 *
 * 9.6 — renders all result fields with color indicators and audio controls
 * 9.7 — "Play All" button is present and interactive
 * 9.8 — Data minimization: MUST NOT render raw numeric values, LOINC codes,
 *        or reference ranges
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PatientResult } from '../components/results/PatientResultSummary'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    // Return a simple key → label mapping for assertions
    const labels: Record<string, string> = {
      'testName.cbc': 'Complete Blood Count',
      'testName.lipidPanel': 'Cholesterol Panel',
      'testName.hba1c': 'Blood Sugar (3-month)',
      'testName.metabolicPanel': 'Metabolic Panel',
      'testName.liverFunction': 'Liver Function',
      'testName.tsh': 'Thyroid Function',
      'testName.urinalysis': 'Urine Test',
      'testName.fastingGlucose': 'Fasting Blood Sugar',
      'interpretation.normal': 'Normal',
      'interpretation.low': 'Low',
      'interpretation.high': 'High',
      'interpretation.criticallow': 'Critical – Low',
      'interpretation.criticalhigh': 'Critical – High',
      playExplanation: 'Play Explanation',
      replay: 'Replay',
      playAll: 'Play All Explanations',
      audioUnavailable: 'Explanation not yet available',
    }
    return labels[key] ?? key
  },
}))

// Mock audio-result-scripts: all MVP scripts are unapproved (plain-text fallback path)
vi.mock('@/lib/audio-result-scripts', () => ({
  resolveAudioScript: (_category: string, field: string, _interp: string) => ({
    id: `${field}-normal`,
    testCategory: '58410-2',
    resultField: field,
    interpretation: 'normal',
    version: '1.0.0',
    approvedBy: '',
    approvedAt: '',
    audioFiles: { en: '', ar: '', prs: '', ps: '' },
    plainTextScripts: {
      en: `Your ${field} result is normal.`,
      ar: 'نتيجتك طبيعية.',
      prs: 'نتیجه شما نرمال است.',
      ps: 'ستاسو پایله نورمال ده.',
    },
  }),
  isScriptApproved: () => false,
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks are declared
// ---------------------------------------------------------------------------
import { PatientResultSummary } from '../components/results/PatientResultSummary'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SINGLE_RESULT: PatientResult[] = [
  { resultField: 'cbc', testCategory: '58410-2', interpretation: 'normal' },
]

const MULTI_RESULTS: PatientResult[] = [
  { resultField: 'cbc', testCategory: '58410-2', interpretation: 'normal' },
  { resultField: 'lipidPanel', testCategory: '57698-3', interpretation: 'high' },
  { resultField: 'hba1c', testCategory: '4548-4', interpretation: 'critical-high' },
]

// ---------------------------------------------------------------------------
// 9.6 — renders all result fields with color indicators
// ---------------------------------------------------------------------------

describe('PatientResultSummary — renders result cards', () => {
  it('renders a card for each result in the list', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    const cards = screen.getByTestId('result-cards')
    // Expect 3 child divs
    expect(cards.children).toHaveLength(3)
  })

  it('renders the plain-language test name for each result', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument()
    expect(screen.getByText('Cholesterol Panel')).toBeInTheDocument()
    expect(screen.getByText('Blood Sugar (3-month)')).toBeInTheDocument()
  })

  it('renders a color indicator (role=img) for each result', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    const indicators = screen.getAllByRole('img')
    // At least one per result card
    expect(indicators.length).toBeGreaterThanOrEqual(MULTI_RESULTS.length)
  })

  it('renders nothing when results array is empty', () => {
    const { container } = render(<PatientResultSummary results={[]} locale="en" />)
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 9.7 — "Play All" button is present and interactive
// ---------------------------------------------------------------------------

describe('PatientResultSummary — Play All button', () => {
  it('renders the Play All button', () => {
    render(<PatientResultSummary results={SINGLE_RESULT} locale="en" />)
    expect(screen.getByTestId('play-all-button')).toBeInTheDocument()
  })

  it('Play All button label comes from the i18n key', () => {
    render(<PatientResultSummary results={SINGLE_RESULT} locale="en" />)
    const btn = screen.getByTestId('play-all-button')
    expect(btn).toHaveTextContent('Play All Explanations')
  })

  it('Play All button is clickable without throwing', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    expect(() => fireEvent.click(screen.getByTestId('play-all-button'))).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 9.8 — Data minimization: no raw values, LOINC codes, or reference ranges
// ---------------------------------------------------------------------------

describe('PatientResultSummary — data minimization', () => {
  it('does NOT render any LOINC codes in the patient-facing view', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    // LOINC codes follow the pattern NNNNN-N
    expect(document.body.textContent).not.toMatch(/\d{5}-\d/)
  })

  it('does NOT render any raw numeric values (g/dL, mmol, etc.)', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    // No floating-point numbers like 9.2 or 14.5
    expect(document.body.textContent).not.toMatch(/\d+\.\d+/)
  })

  it('does NOT render reference range notation (e.g. "12 - 17" or "< 200")', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    // Matches "12 - 17", "12-17", or "< 200"
    expect(document.body.textContent).not.toMatch(/\d+\s*[-–]\s*\d+/)
    expect(document.body.textContent).not.toMatch(/<\s*\d+/)
  })

  it('does NOT render unit strings like g/dL or mmol/L', () => {
    render(<PatientResultSummary results={MULTI_RESULTS} locale="en" />)
    expect(document.body.textContent).not.toMatch(/g\/dL|mmol\/L|mg\/dL|IU\/L/)
  })

  it('shows ONLY plain-language test names (mapped from LOINC key)', () => {
    render(<PatientResultSummary results={SINGLE_RESULT} locale="en" />)
    // The LOINC code must not appear as visible text
    expect(screen.queryByText('58410-2')).toBeNull()
    // The field key must not appear verbatim as visible text
    expect(screen.queryByText('cbc')).toBeNull()
    // The mapped plain-language name MUST be present
    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument()
  })

  it('renders the plain-text script fallback (not numeric explanation)', () => {
    render(<PatientResultSummary results={SINGLE_RESULT} locale="en" />)
    // The fallback text comes from the mocked plainTextScripts
    expect(screen.getByText('Your cbc result is normal.')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Additional: locale switching for RTL languages
// ---------------------------------------------------------------------------

describe('PatientResultSummary — locale rendering', () => {
  it('renders without crashing for the ar locale', () => {
    expect(() =>
      render(<PatientResultSummary results={SINGLE_RESULT} locale="ar" />),
    ).not.toThrow()
  })

  it('renders without crashing for the prs locale', () => {
    expect(() =>
      render(<PatientResultSummary results={SINGLE_RESULT} locale="prs" />),
    ).not.toThrow()
  })

  it('renders without crashing for the ps locale', () => {
    expect(() =>
      render(<PatientResultSummary results={SINGLE_RESULT} locale="ps" />),
    ).not.toThrow()
  })
})
