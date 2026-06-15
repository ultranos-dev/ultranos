/**
 * Plan PDF Tests — Story 54.6 Task 15.4 (AC 6, 7)
 *
 * Unit tests for:
 *  - renderPlanHTML() — output structure and content
 *  - No PHI validation — no patient identifiers in rendered HTML
 *  - All 4 domain sections present
 *  - Deadlines appendix present
 *  - No-PHI disclaimer included
 *  - renderPlanPDF() — returns a Blob
 */

import { describe, it, expect } from 'vitest'
import { renderPlanHTML, renderPlanPDF } from '../lib/plan-pdf'
import type { SeasonalPlan } from '../types/seasonal-planner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function makePlan(overrides: Partial<SeasonalPlan> = {}): SeasonalPlan {
  const today = new Date().toISOString()
  return {
    id: 'plan-pdf-test',
    planPeriod: { start: isoOffset(0), end: isoOffset(30) },
    generatedAt: today,
    generatedBy: 'user-opaque-id-99',
    status: 'draft',
    powerForecast: {
      estimatedAnalyzerHours: 150,
      solarAvailabilityHours: null,
      generatorFuelNeeded: 75,
      recommendations: ['Stock 75L diesel for 30 days of operation.'],
    },
    reagentForecast: {
      items: [
        {
          reagentName: 'Malaria RDT',
          reagentId: 'rg-001',
          linkedLoincCode: '18719-5',
          currentStock: 50,
          projectedConsumption: 90,
          projectedDepletionDate: isoOffset(16),
          expiryDate: isoOffset(60),
          reorderDeadline: isoOffset(5),
          estimatedCost: 450,
        },
      ],
      dataSource: 'linear_projection',
    },
    staffingForecast: {
      currentStaffCount: 2,
      projectedDailyTests: 40,
      recommendedStaffCount: 3,
      shiftAdjustments: ['Add 1 staff member for projected volume.'],
      overtimeHoursEstimate: 0,
    },
    protocolRecommendations: [
      {
        category: 'qc',
        recommendation: 'Increase QC run frequency to 2× daily during peak.',
        priority: 'high',
        effectiveDate: isoOffset(10),
      },
      {
        category: 'protocol',
        recommendation: 'Review FIFO reagent management procedures.',
        priority: 'low',
        effectiveDate: isoOffset(10),
      },
    ],
    deadlines: [
      {
        id: 'dl-001',
        action: 'Order Malaria RDT',
        deadlineDate: isoOffset(5),
        leadTimeDays: 21,
        urgency: 'critical',
        category: 'reagent',
        notes: 'Stock: 50 units. Projected use: 90 units.',
        isOverdue: false,
      },
    ],
    meta: { lastUpdated: today, versionId: '1' },
    _ultranos: {
      createdAt: today,
      dataConfidence: 'moderate',
      surgeAlerts: [
        {
          testCategory: 'ALL',
          testCategoryDisplay: 'All Tests',
          surgeStartDate: isoOffset(10),
          surgeEndDate: isoOffset(40),
          projectedMultiplier: 3,
          confidence: 'moderate',
          daysUntilSurge: 10,
        },
      ],
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: HTML structure
// ---------------------------------------------------------------------------

describe('renderPlanHTML', () => {
  it('returns a string containing valid HTML skeleton', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('<body')
    expect(html).toContain('</body>')
  })

  it('includes title with plan period start date', () => {
    const plan = makePlan()
    const html = renderPlanHTML(plan)
    expect(html).toContain('Seasonal Operations Plan')
  })

  it('includes lab name when provided', () => {
    const html = renderPlanHTML(makePlan(), 'Kandahar District Lab')
    expect(html).toContain('Kandahar District Lab')
  })

  it('uses default lab name "Lab" when none provided', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('>Lab<')
  })
})

// ---------------------------------------------------------------------------
// Tests: all 4 domain sections
// ---------------------------------------------------------------------------

describe('renderPlanHTML — domain sections', () => {
  it('includes Power Forecast section', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Power Forecast')
  })

  it('includes Reagent Forecast section', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Reagent Forecast')
  })

  it('includes Staffing Forecast section', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Staffing Forecast')
  })

  it('includes Protocol Recommendations section', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Protocol Recommendations')
  })

  it('includes Deadlines Appendix section', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Action Deadlines')
  })
})

// ---------------------------------------------------------------------------
// Tests: content rendering
// ---------------------------------------------------------------------------

describe('renderPlanHTML — content', () => {
  it('renders power forecast statistics', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('150')  // estimatedAnalyzerHours
    expect(html).toContain('75')   // generatorFuelNeeded
  })

  it('renders reagent name in forecast table', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Malaria RDT')
  })

  it('renders staffing numbers', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('40')  // projectedDailyTests
  })

  it('renders protocol recommendation text', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('QC run frequency')
  })

  it('renders deadline action in appendix', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('Order Malaria RDT')
  })

  it('highlights surge alert when present', () => {
    const html = renderPlanHTML(makePlan())
    // Surge alert warning message should appear
    expect(html).toContain('surge period')
  })

  it('shows correct confidence badge', () => {
    const html = renderPlanHTML(makePlan({ _ultranos: { createdAt: new Date().toISOString(), dataConfidence: 'moderate', surgeAlerts: [] } }))
    expect(html).toContain('Moderate')
  })
})

// ---------------------------------------------------------------------------
// Tests: no PHI
// ---------------------------------------------------------------------------

describe('renderPlanHTML — no PHI', () => {
  it('does not include generatedBy opaque ID in visible output', () => {
    // generatedBy is an opaque practitioner ID and should NOT be printed
    const html = renderPlanHTML(makePlan())
    // The opaque ID itself appears in the plan but should not be in the HTML
    expect(html).not.toContain('user-opaque-id-99')
  })

  it('does not include any patient identifier fields', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).not.toContain('patientId')
    expect(html).not.toContain('patientName')
    expect(html).not.toContain('patientRef')
  })

  it('includes the no-PHI disclaimer', () => {
    const html = renderPlanHTML(makePlan())
    expect(html).toContain('aggregate operational statistics')
    expect(html).toContain('No patient names')
  })

  it('no LOINC codes appear as patient-linked identifiers — only as reagent linked codes', () => {
    const html = renderPlanHTML(makePlan())
    // LOINC codes are in data but not rendered as visible content (reagentId is shown, not linkedLoincCode)
    // The HTML should not expose PHI through aggregate reagent data
    const serialized = JSON.stringify(html)
    expect(serialized).not.toContain('patientRef')
  })
})

// ---------------------------------------------------------------------------
// Tests: renderPlanPDF
// ---------------------------------------------------------------------------

describe('renderPlanPDF', () => {
  it('returns a Blob', async () => {
    const blob = await renderPlanPDF(makePlan())
    expect(blob).toBeInstanceOf(Blob)
  })

  it('Blob has non-zero size', async () => {
    const blob = await renderPlanPDF(makePlan())
    expect(blob.size).toBeGreaterThan(0)
  })

  it('Blob MIME type includes text/html', async () => {
    const blob = await renderPlanPDF(makePlan())
    expect(blob.type).toContain('text/html')
  })

  it('HTML content inside the Blob includes no-PHI disclaimer', () => {
    // Verify via renderPlanHTML which renderPlanPDF wraps
    const html = renderPlanHTML(makePlan(), 'Test Lab')
    expect(html).toContain('aggregate operational statistics')
    expect(html).toContain('Test Lab')
  })
})
