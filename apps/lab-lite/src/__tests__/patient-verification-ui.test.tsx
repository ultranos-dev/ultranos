/**
 * Story 43.4: Patient ID Verification Logging — Component Tests
 * Tests 7.9–7.11: PatientVerificationForm UI behaviour.
 * PHI COMPLIANCE: No patient names or full ID numbers in any assertion.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PatientVerificationMethod } from '@ultranos/shared-types'
import { PatientVerificationForm } from '../components/verification/PatientVerificationForm'

// Mock heavy dependencies to isolate component under test
vi.mock('@/lib/audit-client', () => ({
  reportVerificationEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  saveVerificationRecord: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ session: null }) },
}))

// Minimal i18n mock — returns the key as the translation
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const defaultProps = {
  sampleId: 'specimen-uuid-001',
  patientRef: 'Patient/patient-uuid-001',
  verifiedBy: 'Practitioner/tech-001',
  onComplete: vi.fn(),
  defaultMethods: [] as PatientVerificationMethod[],
}

function renderForm(props: Partial<typeof defaultProps> = {}) {
  return render(<PatientVerificationForm {...defaultProps} {...props} />)
}

// ---------------------------------------------------------------------------
// 7.9 — "Proceed" button disabled with < 2 methods selected
// ---------------------------------------------------------------------------
describe('PatientVerificationForm — proceed button gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('7.9 Proceed button is disabled when 0 methods are selected', () => {
    renderForm()
    const btn = screen.getByRole('button', { name: /proceed/i })
    expect(btn).toBeDisabled()
  })

  it('7.9 Proceed button is disabled when exactly 1 method is selected and no override', () => {
    renderForm()
    // Check the National ID checkbox
    const nationalIdCheckbox = screen.getByTestId('method-NATIONAL_ID_SCANNED')
    fireEvent.click(nationalIdCheckbox)
    const btn = screen.getByRole('button', { name: /proceed/i })
    expect(btn).toBeDisabled()
  })

  it('7.9 Proceed button is enabled when 2 or more methods are selected', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-NATIONAL_ID_SCANNED'))
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    const btn = screen.getByRole('button', { name: /proceed/i })
    expect(btn).not.toBeDisabled()
  })

  it('7.9 Proceed button enabled when 3 methods selected', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-NATIONAL_ID_SCANNED'))
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    fireEvent.click(screen.getByTestId('method-QR_CODE'))
    const btn = screen.getByRole('button', { name: /proceed/i })
    expect(btn).not.toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 7.10 — Warning banner shown on single-identifier attempt
// ---------------------------------------------------------------------------
describe('PatientVerificationForm — single-identifier warning', () => {
  it('7.10 No warning banner initially', () => {
    renderForm()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('7.10 Warning banner appears when 1 method selected', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    // Warning should be visible
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    // Translation key contains 'singleIdentifier' — mock returns the key
    expect(alert.textContent).toMatch(/singleIdentifier|single.identifier|two.identifier/i)
  })

  it('7.10 Warning disappears when second method is added', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    // Warning visible
    expect(screen.getByRole('alert')).toBeInTheDocument()
    // Add second method
    fireEvent.click(screen.getByTestId('method-NATIONAL_ID_SCANNED'))
    // Warning gone (complete now)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('7.10 Override checkbox appears in warning banner', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    expect(screen.getByTestId('override-checkbox')).toBeInTheDocument()
  })

  it('7.10 Proceed enabled with 1 method + override + sufficient deviation reason', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    // Check override
    fireEvent.click(screen.getByTestId('override-checkbox'))
    // Enter deviation reason
    const reasonInput = screen.getByTestId('deviation-reason-input')
    fireEvent.change(reasonInput, {
      target: { value: 'Patient refused to show ID — verbal only' },
    })
    const btn = screen.getByRole('button', { name: /proceed/i })
    expect(btn).not.toBeDisabled()
  })

  it('7.10 Proceed still disabled with 1 method + override but short deviation reason', () => {
    renderForm()
    fireEvent.click(screen.getByTestId('method-VERBAL_CONFIRMATION'))
    fireEvent.click(screen.getByTestId('override-checkbox'))
    const reasonInput = screen.getByTestId('deviation-reason-input')
    fireEvent.change(reasonInput, { target: { value: 'Too short' } })
    const btn = screen.getByRole('button', { name: /proceed/i })
    expect(btn).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 7.11 — RTL snapshot test: form renders correctly in LTR and RTL
// ---------------------------------------------------------------------------
describe('PatientVerificationForm — RTL layout', () => {
  it('7.11 renders without errors in LTR context', () => {
    const { container } = renderForm()
    expect(container.querySelector('[dir]')).toBeTruthy()
  })

  it('7.11 renders without errors in RTL context (Dari/Arabic)', () => {
    const { container } = render(
      <div dir="rtl" lang="prs">
        <PatientVerificationForm {...defaultProps} />
      </div>,
    )
    // Form must be present and not crash in RTL context
    expect(screen.getByRole('button', { name: /proceed/i })).toBeInTheDocument()
    // Verify container has RTL direction
    const wrapper = container.querySelector('[dir="rtl"]')
    expect(wrapper).toBeInTheDocument()
  })

  it('7.11 QR_CODE method pre-checked when defaultMethods includes it', () => {
    renderForm({ defaultMethods: [PatientVerificationMethod.QR_CODE] })
    const qrCheckbox = screen.getByTestId('method-QR_CODE')
    expect(qrCheckbox).toBeChecked()
  })
})
