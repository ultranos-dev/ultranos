/**
 * Story 43.2 — QC History View Tests (Task 9.8)
 * Renders table with correct columns; handles empty state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('@/services/qc-run-service', () => ({
  getQcRunHistory: vi.fn(),
}))

import { QcHistoryView } from '@/components/qc/QcHistoryView'
import { getQcRunHistory } from '@/services/qc-run-service'
import type { QcRun } from '@/lib/db'

const mockedGetQcRunHistory = vi.mocked(getQcRunHistory)

const TODAY = new Date().toISOString().slice(0, 10)

function makeRun(overrides: Partial<QcRun> = {}): QcRun {
  return {
    id: crypto.randomUUID(),
    analyte: '718-7',
    instrumentId: 'analyzer-01',
    controlLevel: 'L1',
    controlValues: { hemoglobin: 12.5 },
    expectedRange: { low: 11.0, high: 14.0 },
    passOrFail: 'PASS',
    timestamp: new Date().toISOString(),
    calendarDate: TODAY,
    techId: 'tech-abc',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QcHistoryView — empty state (Task 9.8)', () => {
  it('shows empty message when no QC runs exist', async () => {
    mockedGetQcRunHistory.mockResolvedValue([])
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => {
      expect(screen.getByText('history.empty')).toBeInTheDocument()
    })
  })

  it('does not render table when no runs', async () => {
    mockedGetQcRunHistory.mockResolvedValue([])
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull())
  })
})

describe('QcHistoryView — loaded with runs (Task 9.8)', () => {
  beforeEach(() => {
    mockedGetQcRunHistory.mockResolvedValue([
      makeRun({ id: 'r1', passOrFail: 'PASS', calendarDate: TODAY, techId: 'tech-abc' }),
      makeRun({ id: 'r2', passOrFail: 'FAIL', calendarDate: TODAY, techId: 'tech-xyz' }),
    ])
  })

  it('renders a table with all 6 required columns', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    // Column headers from t('history.col.*')
    const expectedHeaders = [
      'history.col.date',
      'history.col.controlLevel',
      'history.col.measuredValues',
      'history.col.expectedRange',
      'history.col.result',
      'history.col.tech',
    ]
    for (const header of expectedHeaders) {
      expect(screen.getByText(header)).toBeInTheDocument()
    }
  })

  it('renders a row for each QC run', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    const rows = screen.getAllByRole('row')
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it('shows PASS result badge', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByText('result.pass')).toBeInTheDocument())
  })

  it('shows FAIL result badge', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => expect(screen.getByText('result.fail')).toBeInTheDocument())
  })

  it('shows tech IDs', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => {
      expect(screen.getByText('tech-abc')).toBeInTheDocument()
      expect(screen.getByText('tech-xyz')).toBeInTheDocument()
    })
  })

  it('shows control values in measured column', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => {
      // hemoglobin: 12.5
      expect(screen.getAllByText(/hemoglobin: 12\.5/).length).toBeGreaterThan(0)
    })
  })

  it('renders the section heading', async () => {
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => {
      // heading: t('history.title', { analyte: ... })
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    })
  })
})

describe('QcHistoryView — Levey-Jennings chart (Task 9.8)', () => {
  it('renders the SVG chart when 2 or more runs exist', async () => {
    mockedGetQcRunHistory.mockResolvedValue([
      makeRun({ id: 'r1', controlValues: { hemoglobin: 12.5 } }),
      makeRun({ id: 'r2', controlValues: { hemoglobin: 13.0 } }),
    ])
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /Levey-Jennings/i })).toBeInTheDocument()
    })
  })

  it('does not render the SVG chart for a single run', async () => {
    mockedGetQcRunHistory.mockResolvedValue([makeRun({ id: 'r1' })])
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    await waitFor(() => {
      expect(screen.queryByRole('img', { name: /Levey-Jennings/i })).toBeNull()
    })
  })
})

describe('QcHistoryView — loading state (Task 9.8)', () => {
  it('shows loading text before data resolves', () => {
    mockedGetQcRunHistory.mockReturnValue(new Promise(() => {}))
    render(<QcHistoryView analyte="718-7" instrumentId="analyzer-01" />)
    expect(screen.getByText('history.loading')).toBeInTheDocument()
  })
})
