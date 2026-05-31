/**
 * Story 43.2 — QC Run Entry Form Tests (Task 9.9)
 * Validates required fields, auto-calculates pass/fail, saves to Dexie.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import 'fake-indexeddb/auto'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      'form.title': 'Record QC Run',
      'form.analyte': 'Analyte',
      'form.analytePlaceholder': 'e.g. 718-7',
      'form.instrument': 'Instrument',
      'form.instrumentPlaceholder': 'e.g. analyzer-01',
      'form.controlLevel': 'Control Level',
      'form.measuredValue': 'Measured Value',
      'form.expectedLow': 'Expected Low',
      'form.expectedHigh': 'Expected High',
      'form.calculatedResult': 'Calculated Result',
      'form.save': 'Save QC Run',
      'form.saving': 'Saving...',
      'form.error.analyteRequired': 'Analyte is required',
      'form.error.instrumentRequired': 'Instrument is required',
      'form.error.invalidValues': 'Invalid measurement values',
      'form.error.saveFailed': 'Failed to save QC run',
      'form.savedSuccess': 'QC run saved',
      'form.level.l1': 'Level 1',
      'form.level.l2': 'Level 2',
      'form.level.l3': 'Level 3',
      'result.pass': 'PASS',
      'result.fail': 'FAIL',
    }
    if (params) return `${msgs[key] ?? key}(${JSON.stringify(params)})`
    return msgs[key] ?? key
  },
}))

vi.mock('@/stores/auth-session-store', () => {
  // Must satisfy both the hook call pattern (form component) and .getState() pattern (service)
  const store = (selector: (s: { session: { userId: string } }) => unknown) =>
    selector({ session: { userId: 'tech-abc' } })
  store.getState = () => ({ session: { userId: 'tech-abc' } })
  return { useAuthSessionStore: store }
})

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: Date.now(), logicalTime: 0, nodeId: 'test' }) },
  serializeHlc: () => new Date().toISOString(),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
  setAuditStoreAdapter: vi.fn(),
}))

import { QcRunEntryForm } from '@/components/qc/QcRunEntryForm'
import { getDb } from '@/lib/db'

beforeEach(async () => {
  const db = getDb()
  await db.qcRuns.clear()
  vi.clearAllMocks()
})

/**
 * Use fireEvent.change for number inputs — userEvent.type on type="number"
 * is extremely slow (character-by-character re-renders) and times out.
 */
function fillForm(
  analyte: string,
  instrument: string,
  measured: string,
  low: string,
  high: string,
) {
  fireEvent.change(screen.getByLabelText(/Analyte/i), { target: { value: analyte } })
  fireEvent.change(screen.getByLabelText(/Instrument/i), { target: { value: instrument } })
  fireEvent.change(screen.getByLabelText(/Measured Value/i), { target: { value: measured } })
  fireEvent.change(screen.getByLabelText(/Expected Low/i), { target: { value: low } })
  fireEvent.change(screen.getByLabelText(/Expected High/i), { target: { value: high } })
}

describe('QcRunEntryForm — renders (Task 9.9)', () => {
  it('renders form heading', () => {
    render(<QcRunEntryForm />)
    expect(screen.getByText('Record QC Run')).toBeInTheDocument()
  })

  it('renders all required input fields', () => {
    render(<QcRunEntryForm />)
    expect(screen.getByLabelText(/Analyte/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Instrument/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Measured Value/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Expected Low/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Expected High/i)).toBeInTheDocument()
  })

  it('submit button is initially disabled', () => {
    render(<QcRunEntryForm />)
    expect(screen.getByRole('button', { name: 'Save QC Run' })).toBeDisabled()
  })
})

describe('QcRunEntryForm — auto-calculates pass/fail (Task 9.9)', () => {
  it('shows PASS preview when measured value is within range', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '12.5', '11.0', '14.0')
    await waitFor(() => {
      // The calculated result preview shows PASS
      const preview = screen.getByRole('status')
      expect(preview).toHaveTextContent('PASS')
    })
  })

  it('shows FAIL preview when measured value is outside range', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '10.0', '11.0', '14.0')
    await waitFor(() => {
      const preview = screen.getByRole('status')
      expect(preview).toHaveTextContent('FAIL')
    })
  })

  it('shows PASS when measured value equals expected low boundary', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '11.0', '11.0', '14.0')
    await waitFor(() => {
      const preview = screen.getByRole('status')
      expect(preview).toHaveTextContent('PASS')
    })
  })

  it('shows PASS when measured value equals expected high boundary', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '14.0', '11.0', '14.0')
    await waitFor(() => {
      const preview = screen.getByRole('status')
      expect(preview).toHaveTextContent('PASS')
    })
  })
})

describe('QcRunEntryForm — validation (Task 9.9)', () => {
  it('shows error when analyte is missing', async () => {
    render(<QcRunEntryForm />)
    // Only fill instrument and values, no analyte
    fireEvent.change(screen.getByLabelText(/Instrument/i), { target: { value: 'analyzer-01' } })
    fireEvent.change(screen.getByLabelText(/Measured Value/i), { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText(/Expected Low/i), { target: { value: '11.0' } })
    fireEvent.change(screen.getByLabelText(/Expected High/i), { target: { value: '14.0' } })
    // Submit via form event (button is disabled because analyte is empty)
    const form = screen.getByRole('button', { name: /Save QC Run/i }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Analyte is required')
    })
  })

  it('submit button becomes enabled when all fields are valid', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '12.5', '11.0', '14.0')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save QC Run' })).not.toBeDisabled()
    })
  })
})

describe('QcRunEntryForm — saves to Dexie (Task 9.9)', () => {
  it('saves a QC run to Dexie when submitted', async () => {
    const onSaved = vi.fn()
    render(<QcRunEntryForm onSaved={onSaved} />)
    fillForm('718-7', 'analyzer-01', '12.5', '11.0', '14.0')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save QC Run' })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save QC Run' }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce()
    })

    // Verify Dexie persistence
    const db = getDb()
    const saved = await db.qcRuns.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0].analyte).toBe('718-7')
    expect(saved[0].instrumentId).toBe('analyzer-01')
    expect(saved[0].passOrFail).toBe('PASS')
  })

  it('onSaved callback receives the saved run with correct passOrFail', async () => {
    const onSaved = vi.fn()
    render(<QcRunEntryForm onSaved={onSaved} />)
    // Failing case: 10.0 outside [11.0, 14.0]
    fillForm('718-7', 'analyzer-01', '10.0', '11.0', '14.0')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save QC Run' })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save QC Run' }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce()
    })

    const savedRun = onSaved.mock.calls[0][0]
    expect(savedRun.passOrFail).toBe('FAIL')
    expect(savedRun.techId).toBe('tech-abc')
  })

  it('resets form after successful save', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '12.5', '11.0', '14.0')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save QC Run' })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save QC Run' }))

    await waitFor(() => {
      // Fields should be cleared
      expect(screen.getByLabelText(/Analyte/i)).toHaveValue('')
      expect(screen.getByLabelText(/Instrument/i)).toHaveValue('')
    })
  })

  it('shows success message after save', async () => {
    render(<QcRunEntryForm />)
    fillForm('718-7', 'analyzer-01', '12.5', '11.0', '14.0')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save QC Run' })).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save QC Run' }))

    await waitFor(() => {
      // Success message rendered
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })
})
