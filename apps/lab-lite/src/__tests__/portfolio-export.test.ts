/**
 * Story 51.6 — Technician Performance Portfolio: Export Tests
 * Task 8: Tests for portfolio-export.ts
 */
import { describe, it, expect } from 'vitest'
import { exportPortfolio, getExportFilename } from '../lib/portfolio-export'
import type { FullPortfolioMetrics, DateRange } from '../lib/portfolio-service'

/** Helper: read Blob as text without relying on Blob.text() (not available in jsdom) */
async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const RANGE: DateRange = { startDate: '2026-01-01', endDate: '2026-01-31' }

function makeMetrics(overrides?: Partial<FullPortfolioMetrics>): FullPortfolioMetrics {
  return {
    techId: 'tech-abc123',
    dateRange: RANGE,
    testsPerShift: {
      value: 8.5,
      unit: 'tests/shift',
      trend: 'IMPROVING',
      previousValue: 6.2,
      dataPoints: 15,
      noData: false,
    },
    averageTAT: [
      {
        loincCode: '718-7',
        avgTatMinutes: 42,
        trend: 'STABLE',
        previousAvgTatMinutes: 45,
        sampleCount: 30,
      },
    ],
    qcPassRate: {
      value: 94,
      unit: '%',
      trend: 'IMPROVING',
      previousValue: 87,
      dataPoints: 50,
      noData: false,
    },
    rejectionRate: {
      value: 3,
      unit: '%',
      trend: 'IMPROVING',
      previousValue: 8,
      dataPoints: 100,
      noData: false,
      rejectionBreakdown: [{ reason: 'hemolyzed', count: 3 }],
    },
    trainingModules: [
      { sopId: 'sop-1', title: 'Hemoglobin SOP', category: 'HEMATOLOGY', version: '1.0', acknowledgedAt: '2026-01-10T00:00:00Z' },
    ],
    mentorshipCount: 2,
    achievements: [],
    calculatedAt: '2026-01-31T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// exportPortfolio
// ---------------------------------------------------------------------------

describe('exportPortfolio', () => {
  it('generates a Blob of HTML content', () => {
    const blob = exportPortfolio(makeMetrics(), { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/html;charset=utf-8')
  })

  it('includes all metric values in the HTML', async () => {
    const metrics = makeMetrics()
    const blob = exportPortfolio(metrics, { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('8.5')       // testsPerShift.value
    expect(text).toContain('94%')       // qcPassRate.value
    expect(text).toContain('3%')        // rejectionRate.value
    expect(text).toContain('42m')       // avgTatMinutes
    expect(text).toContain('718-7')     // loincCode
    expect(text).toContain('Hemoglobin SOP') // training module
    expect(text).toContain('hemolyzed') // rejection reason
  })

  it('uses techId in the footer, not the tech name (PHI safety)', async () => {
    const blob = exportPortfolio(makeMetrics(), { techId: 'tech-abc123', techName: 'Real Person Name', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('tech-abc123')  // opaque ID included
    expect(text).toContain('Real Person Name') // display name in header is OK (not PHI)
  })

  it('includes a blank supervisor comments section', async () => {
    const blob = exportPortfolio(makeMetrics(), { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('Supervisor Comments')
  })

  it('includes print CSS for paper output', async () => {
    const blob = exportPortfolio(makeMetrics(), { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('@media print')
  })

  it('includes achievements placeholder when no achievements', async () => {
    const blob = exportPortfolio(makeMetrics({ achievements: [] }), { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('Achievements (0)')
  })

  it('includes the date range in the document', async () => {
    const blob = exportPortfolio(makeMetrics(), { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('2026-01-01')
    expect(text).toContain('2026-01-31')
  })

  it('labels the document as Professional Development Portfolio (not Performance Report)', async () => {
    const blob = exportPortfolio(makeMetrics(), { techId: 'tech-abc123', techName: 'Test Tech', labName: 'Test Lab' })
    const text = await blobToText(blob)
    expect(text).toContain('Professional Development Portfolio')
    expect(text).not.toContain('Performance Report')
    expect(text).not.toContain('Surveillance')
    expect(text).not.toContain('Compliance')
  })
})

// ---------------------------------------------------------------------------
// getExportFilename
// ---------------------------------------------------------------------------

describe('getExportFilename', () => {
  it('uses techId in filename (not tech name)', () => {
    const filename = getExportFilename('tech-abc123', RANGE)
    expect(filename).toContain('tech-abc123')
    expect(filename).not.toContain('Real Person Name')
  })

  it('includes the date range in the filename', () => {
    const filename = getExportFilename('tech-1', RANGE)
    expect(filename).toContain('2026-01-01')
    expect(filename).toContain('2026-01-31')
  })

  it('produces a .html extension', () => {
    const filename = getExportFilename('tech-1', RANGE)
    expect(filename).toMatch(/\.html$/)
  })

  it('sanitizes special characters in techId', () => {
    const filename = getExportFilename('tech/special@chars!', RANGE)
    expect(filename).not.toMatch(/[/@!]/)
  })
})
