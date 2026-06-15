/**
 * Story 43.2 — QC Warning Banner Tests (Task 9.4)
 * Snapshot tests for all warning states in LTR and RTL.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

// Mock qc-run-service so we control what getTodayQcRun returns
vi.mock('@/services/qc-run-service', () => ({
  getTodayQcRun: vi.fn(),
}))

import { QcWarningBanner } from '@/components/qc/QcWarningBanner'
import { getTodayQcRun } from '@/services/qc-run-service'

const mockedGetTodayQcRun = vi.mocked(getTodayQcRun)

afterEach(() => {
  document.dir = 'ltr'
  vi.clearAllMocks()
})

describe('QcWarningBanner — loading state', () => {
  it('renders nothing while loading (returns null)', () => {
    // Never resolves during this test
    mockedGetTodayQcRun.mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('QcWarningBanner — passing state (Task 9.4)', () => {
  beforeEach(() => {
    mockedGetTodayQcRun.mockResolvedValue({
      id: 'run-pass',
      analyte: '718-7',
      instrumentId: 'analyzer-01',
      controlLevel: 'L1',
      controlValues: { hemoglobin: 12.5 },
      expectedRange: { low: 11.0, high: 14.0 },
      passOrFail: 'PASS',
      timestamp: new Date().toISOString(),
      calendarDate: new Date().toISOString().slice(0, 10),
      techId: 'tech-abc',
    })
  })

  it('shows passing status (LTR)', async () => {
    document.dir = 'ltr'
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(container).toMatchSnapshot()
  })

  it('shows passing status (RTL)', async () => {
    document.dir = 'rtl'
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(container).toMatchSnapshot()
  })

  it('passing state has role="status" not role="alert"', async () => {
    render(<QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('QcWarningBanner — failing state (Task 9.4)', () => {
  beforeEach(() => {
    mockedGetTodayQcRun.mockResolvedValue({
      id: 'run-fail',
      analyte: '718-7',
      instrumentId: 'analyzer-01',
      controlLevel: 'L1',
      controlValues: { hemoglobin: 10.0 },
      expectedRange: { low: 11.0, high: 14.0 },
      passOrFail: 'FAIL',
      timestamp: new Date().toISOString(),
      calendarDate: new Date().toISOString().slice(0, 10),
      techId: 'tech-abc',
    })
  })

  it('shows alert when QC is failing (LTR)', async () => {
    document.dir = 'ltr'
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(container).toMatchSnapshot()
  })

  it('shows alert when QC is failing (RTL)', async () => {
    document.dir = 'rtl'
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(container).toMatchSnapshot()
  })

  it('failing state has aria-live="assertive"', async () => {
    render(<QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
  })
})

describe('QcWarningBanner — no_qc_today state (Task 9.4)', () => {
  beforeEach(() => {
    mockedGetTodayQcRun.mockResolvedValue(undefined)
  })

  it('shows amber warning when no QC run today (LTR)', async () => {
    document.dir = 'ltr'
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(container).toMatchSnapshot()
  })

  it('shows amber warning when no QC run today (RTL)', async () => {
    document.dir = 'rtl'
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(container).toMatchSnapshot()
  })

  it('no_qc_today state has aria-live="polite"', async () => {
    render(<QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('QcWarningBanner — error state (Task 9.4)', () => {
  it('renders nothing on error (does not block form)', async () => {
    mockedGetTodayQcRun.mockRejectedValue(new Error('DB error'))
    const { container } = render(
      <QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />,
    )
    // After error resolves, component returns null
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })
})

describe('QcWarningBanner — safety icon RTL invariance (Task 9.4)', () => {
  it('alert triangle SVG has aria-hidden and does not carry RTL direction style', async () => {
    document.dir = 'rtl'
    mockedGetTodayQcRun.mockResolvedValue(undefined) // no_qc_today → alert triangle visible
    render(<QcWarningBanner analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    const svgs = document.querySelectorAll('svg[aria-hidden="true"]')
    expect(svgs.length).toBeGreaterThan(0)
    // Safety icons must NOT have transform:scaleX(-1) or direction:rtl
    svgs.forEach((svg) => {
      const style = (svg as HTMLElement).style
      expect(style.transform).not.toContain('scaleX(-1)')
      expect(style.direction).not.toBe('rtl')
    })
  })
})
