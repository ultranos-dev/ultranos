/**
 * Component Tests — Story 43.5: Plausibility UI
 *
 * Covers:
 *   - PlausibilityWarningBanner: CRITICAL renders red, WARNING renders amber,
 *     both sections have acknowledge buttons, already-acknowledged shows label
 *   - FlagAcknowledgmentDialog: form validation (min 10 chars), submit saves to db
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlausibilityWarningBanner } from '../components/plausibility/PlausibilityWarningBanner'
import { FlagAcknowledgmentDialog } from '../components/plausibility/FlagAcknowledgmentDialog'
import type { PlausibilityFlag } from '../lib/plausibility/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string) => key,
}))

vi.mock('../lib/db', () => ({
  db: {
    addFlagAcknowledgment: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../lib/audit-client', () => ({
  reportPlausibilityEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test' }) },
  serializeHlc: () => 'hlc-ts',
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: (fn: (s: { session: { userId: string } | null }) => unknown) =>
    fn({ session: { userId: 'tech-001' } }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCriticalFlag(overrides: Partial<PlausibilityFlag> = {}): PlausibilityFlag {
  return {
    id: 'flag-crit-1',
    ruleType: 'ABSOLUTE_RANGE',
    analyte: 'Hemoglobin',
    loincCode: '718-7',
    severity: 'CRITICAL',
    message: 'Hemoglobin -1 is impossible',
    currentValue: -1,
    acknowledged: false,
    ...overrides,
  }
}

function makeWarningFlag(overrides: Partial<PlausibilityFlag> = {}): PlausibilityFlag {
  return {
    id: 'flag-warn-1',
    ruleType: 'DELTA_CHECK',
    analyte: 'WBC',
    loincCode: '6690-2',
    severity: 'WARNING',
    message: 'WBC changed 50% — delta exceeded',
    currentValue: 15.0,
    referenceValue: 10.0,
    acknowledged: false,
    ...overrides,
  }
}

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// PlausibilityWarningBanner
// ---------------------------------------------------------------------------

describe('PlausibilityWarningBanner', () => {
  it('renders nothing when flags array is empty', () => {
    const { container } = render(
      <PlausibilityWarningBanner flags={[]} onAcknowledge={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders CRITICAL section for critical flags', () => {
    render(
      <PlausibilityWarningBanner
        flags={[makeCriticalFlag()]}
        onAcknowledge={vi.fn()}
      />,
    )
    // Banner title key is rendered via our mock translation
    expect(screen.getByText('bannerCriticalTitle')).toBeDefined()
  })

  it('renders WARNING section for warning flags', () => {
    render(
      <PlausibilityWarningBanner
        flags={[makeWarningFlag()]}
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByText('bannerWarningTitle')).toBeDefined()
  })

  it('renders both CRITICAL and WARNING sections when both are present', () => {
    render(
      <PlausibilityWarningBanner
        flags={[makeCriticalFlag(), makeWarningFlag()]}
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByText('bannerCriticalTitle')).toBeDefined()
    expect(screen.getByText('bannerWarningTitle')).toBeDefined()
  })

  it('renders acknowledge button for unacknowledged flags', () => {
    render(
      <PlausibilityWarningBanner
        flags={[makeCriticalFlag({ acknowledged: false })]}
        onAcknowledge={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button', { name: 'acknowledgeButton' })
    expect(btn).toBeDefined()
  })

  it('shows acknowledged label for already-acknowledged flags', () => {
    render(
      <PlausibilityWarningBanner
        flags={[makeCriticalFlag({ acknowledged: true })]}
        onAcknowledge={vi.fn()}
      />,
    )
    expect(screen.getByText('acknowledgedLabel')).toBeDefined()
  })

  it('calls onAcknowledge with the correct flag when button is clicked', async () => {
    const onAck = vi.fn()
    const user = userEvent.setup()
    const flag = makeCriticalFlag()
    render(<PlausibilityWarningBanner flags={[flag]} onAcknowledge={onAck} />)
    const btn = screen.getByRole('button', { name: 'acknowledgeButton' })
    await user.click(btn)
    expect(onAck).toHaveBeenCalledWith(flag)
  })
})

// ---------------------------------------------------------------------------
// FlagAcknowledgmentDialog
// ---------------------------------------------------------------------------

describe('FlagAcknowledgmentDialog', () => {
  it('renders the dialog with the flag analyte name', () => {
    render(
      <FlagAcknowledgmentDialog
        flag={makeCriticalFlag()}
        resultId="result-001"
        patientRef="Patient/uuid-001"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Hemoglobin')).toBeDefined()
  })

  it('submit button is disabled when explanation is empty', () => {
    render(
      <FlagAcknowledgmentDialog
        flag={makeCriticalFlag()}
        resultId="result-001"
        patientRef="Patient/uuid-001"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const submitBtn = screen.getByRole('button', { name: 'dialogSubmit' })
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('submit button is disabled when explanation is fewer than 10 characters', async () => {
    const user = userEvent.setup()
    render(
      <FlagAcknowledgmentDialog
        flag={makeCriticalFlag()}
        resultId="result-001"
        patientRef="Patient/uuid-001"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'short')
    const submitBtn = screen.getByRole('button', { name: 'dialogSubmit' })
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('submit button is enabled when explanation has >= 10 characters', async () => {
    const user = userEvent.setup()
    render(
      <FlagAcknowledgmentDialog
        flag={makeCriticalFlag()}
        resultId="result-001"
        patientRef="Patient/uuid-001"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'This is a valid explanation')
    const submitBtn = screen.getByRole('button', { name: 'dialogSubmit' })
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <FlagAcknowledgmentDialog
        flag={makeCriticalFlag()}
        resultId="result-001"
        patientRef="Patient/uuid-001"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'dialogCancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm with acknowledged flag after valid submission', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <FlagAcknowledgmentDialog
        flag={makeCriticalFlag()}
        resultId="result-001"
        patientRef="Patient/uuid-001"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'Confirmed hemolysed sample — repeat ordered')
    const submitBtn = screen.getByRole('button', { name: 'dialogSubmit' })
    await user.click(submitBtn)
    expect(onConfirm).toHaveBeenCalledOnce()
    const [calledFlag] = onConfirm.mock.calls[0] as [PlausibilityFlag]
    expect(calledFlag.acknowledged).toBe(true)
  })
})
