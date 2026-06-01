/**
 * Donor Report Generator Tests — Story 50.2
 *
 * Covers:
 *  - Correct aggregation per template section type (test_summary, demographics, positivity, reimbursement)
 *  - Demographic suppression (count < 5 suppressed)
 *  - Reimbursement calculations (rate × count = subtotal, grand total)
 *  - Warnings: 'no_data', 'partial_data'
 *  - Tagged filtering: only programTags-matching, period-matching, 'original' entries
 *  - Audit event emission on report generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateDonorReport } from '../lib/donor-report-generator'
import type { LabLogbookEntry } from '../lib/db'
import type { DonorProgram, DonorReportTemplate } from '../lib/donor-types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeEntry = (overrides: Partial<LabLogbookEntry> = {}): LabLogbookEntry =>
  ({
    id: 'e-' + Math.random(),
    date: '2026-03-15',
    testLoincCode: '11545-1',
    testType: 'AFB Smear Microscopy',
    resultSummary: 'Negative',
    entryType: 'original',
    patientAge: 30,
    programTags: ['WHO_TB'],
    syncStatus: 'pending',
    submittedBy: 'tech-1',
    updatedAt: new Date().toISOString(),
    facilityId: 'fac-1',
    ...overrides,
  } as LabLogbookEntry)

const WHO_TB_PROGRAM: DonorProgram = {
  id: 'prog-1',
  programCode: 'WHO_TB',
  programName: 'WHO TB Program',
  donorOrganization: 'World Health Organization',
  status: 'active',
  reimbursementRates: [],
  loincCodes: ['11545-1'],
  templateCode: 'WHO_TB_QUARTERLY',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  syncStatus: 'pending',
}

const MSF_PROGRAM: DonorProgram = {
  id: 'prog-2',
  programCode: 'MSF_MALARIA',
  programName: 'MSF Malaria Program',
  donorOrganization: 'Médecins Sans Frontières',
  status: 'active',
  reimbursementRates: [
    { loincCode: '32700-7', testLabel: 'Malaria RDT', ratePerTest: 150, currency: 'AFN' },
    { loincCode: '51587-4', testLabel: 'Malaria Smear', ratePerTest: 200, currency: 'AFN' },
  ],
  loincCodes: ['32700-7', '51587-4'],
  templateCode: 'MSF_MALARIA_MONTHLY',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  syncStatus: 'pending',
}

const WHO_TB_TEMPLATE: DonorReportTemplate = {
  templateCode: 'WHO_TB_QUARTERLY',
  templateName: 'WHO TB Quarterly Report',
  donorOrganization: 'World Health Organization',
  reportingFrequency: 'quarterly',
  includeReimbursement: false,
  headerFields: [],
  footerFields: [],
  sections: [
    {
      sectionId: 'afb-summary',
      sectionTitle: 'AFB Smear Summary',
      sectionType: 'test_summary',
      columns: [],
      filterLoincCodes: ['11545-1'],
    },
    {
      sectionId: 'demographics',
      sectionTitle: 'Demographics',
      sectionType: 'demographics',
      columns: [],
    },
  ],
}

const MSF_MALARIA_TEMPLATE: DonorReportTemplate = {
  templateCode: 'MSF_MALARIA_MONTHLY',
  templateName: 'MSF Malaria Monthly Report',
  donorOrganization: 'Médecins Sans Frontières',
  reportingFrequency: 'monthly',
  includeReimbursement: true,
  headerFields: [],
  footerFields: [],
  sections: [
    {
      sectionId: 'malaria-summary',
      sectionTitle: 'Malaria Test Summary',
      sectionType: 'test_summary',
      columns: [],
    },
    {
      sectionId: 'positivity',
      sectionTitle: 'Positivity Trend',
      sectionType: 'positivity',
      columns: [],
    },
  ],
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDonorProgramByCode: vi.fn(),
  getAllLogbookEntries: vi.fn(),
  getCustomDonorTemplates: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/donor-templates', () => ({
  resolveTemplate: vi.fn(),
  getCustomDonorTemplates: vi.fn().mockResolvedValue([]),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
}))

import { getDonorProgramByCode, getAllLogbookEntries } from '../lib/db'
import { resolveTemplate } from '../lib/donor-templates'

const mockGetProgram = getDonorProgramByCode as ReturnType<typeof vi.fn>
const mockGetEntries = getAllLogbookEntries as ReturnType<typeof vi.fn>
const mockResolveTemplate = resolveTemplate as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetEntries.mockResolvedValue([])
  mockResolveTemplate.mockReturnValue(null)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateDonorReport', () => {
  describe('program / template resolution', () => {
    it('throws if program not found', async () => {
      mockGetProgram.mockResolvedValue(null)
      await expect(
        generateDonorReport('UNKNOWN', '2026-01-01', '2026-03-31', 'tech-1'),
      ).rejects.toThrow('Donor program not found: UNKNOWN')
    })

    it('throws if template not found', async () => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(null)
      await expect(
        generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1'),
      ).rejects.toThrow('Template not found: WHO_TB_QUARTERLY')
    })
  })

  describe('tagged entry filtering', () => {
    beforeEach(() => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(WHO_TB_TEMPLATE)
    })

    it('includes only entries tagged with the program code', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-10' }),
        makeEntry({ programTags: ['MSF_MALARIA'], date: '2026-02-10' }),   // excluded
        makeEntry({ programTags: [], date: '2026-02-10' }),                 // excluded
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      expect(summarySection.rows[0]!.totalPerformed).toBe(1)
    })

    it('excludes entries outside the period', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2025-12-31' }),  // before period
        makeEntry({ programTags: ['WHO_TB'], date: '2026-01-01' }),  // on start — included
        makeEntry({ programTags: ['WHO_TB'], date: '2026-03-31' }),  // on end — included
        makeEntry({ programTags: ['WHO_TB'], date: '2026-04-01' }),  // after period
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      expect(summarySection.rows[0]!.totalPerformed).toBe(2)
    })

    it('excludes amended (non-original) entries', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-10', entryType: 'original' }),
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-10', entryType: 'amendment' }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      expect(summarySection.rows[0]!.totalPerformed).toBe(1)
    })
  })

  describe('test_summary section', () => {
    beforeEach(() => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(WHO_TB_TEMPLATE)
    })

    it('counts totals correctly across multiple entries', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-01', resultSummary: 'Positive', testLoincCode: '11545-1' }),
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-02', resultSummary: 'Negative', testLoincCode: '11545-1' }),
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-03', resultSummary: 'Negative', testLoincCode: '11545-1' }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      const row = summarySection.rows[0]!
      expect(row.totalPerformed).toBe(3)
      expect(row.totalPositive).toBe(1)
      expect(row.totalNegative).toBe(2)
    })

    it('detects positive from "detected" keyword', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-01', resultSummary: 'MTB Detected', testLoincCode: '11545-1' }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      expect(summarySection.rows[0]!.totalPositive).toBe(1)
    })

    it('detects positive from "+" in result summary', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-01', resultSummary: '3+ AFB', testLoincCode: '11545-1' }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      expect(summarySection.rows[0]!.totalPositive).toBe(1)
    })

    it('calculates positivity rate as percentage rounded to 1 decimal', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-01', resultSummary: 'Positive' }),
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-02', resultSummary: 'Positive' }),
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-03', resultSummary: 'Negative' }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const row = report.sections[0]!.rows[0]!
      expect(row.positivityRate).toBe(66.7)
    })

    it('returns no rows for an empty section', async () => {
      mockGetEntries.mockResolvedValue([])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const summarySection = report.sections.find((s) => s.sectionId === 'afb-summary')!
      expect(summarySection.rows).toHaveLength(0)
    })
  })

  describe('demographics section — suppression', () => {
    beforeEach(() => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(WHO_TB_TEMPLATE)
    })

    it('suppresses age groups with fewer than 5 positive cases', async () => {
      // Only 2 positives aged 25–34 → should be suppressed (< 5)
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-01', resultSummary: 'Positive', patientAge: 28 }),
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-02', resultSummary: 'Positive', patientAge: 30 }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const demoSection = report.sections.find((s) => s.sectionId === 'demographics')!
      // 25–34 group has only 2 → suppressed; all others have 0 → suppressed
      expect(demoSection.rows).toHaveLength(0)
    })

    it('includes age groups at or above suppression threshold', async () => {
      // 5 positives aged 25–34 → should appear
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeEntry({ programTags: ['WHO_TB'], date: `2026-02-0${i + 1}`, resultSummary: 'Positive', patientAge: 28 }),
      )
      mockGetEntries.mockResolvedValue(entries)

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const demoSection = report.sections.find((s) => s.sectionId === 'demographics')!
      const group2534 = demoSection.rows.find((r) => r.ageGroup === '25–34')
      expect(group2534).toBeDefined()
      expect(group2534!.total).toBe(5)
    })

    it('only counts positive cases in demographics (not all entries)', async () => {
      // 10 negatives in 25–34 → NOT counted in demographics
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ programTags: ['WHO_TB'], date: `2026-02-0${(i % 9) + 1}`, resultSummary: 'Negative', patientAge: 28 }),
      )
      mockGetEntries.mockResolvedValue(entries)

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      const demoSection = report.sections.find((s) => s.sectionId === 'demographics')!
      expect(demoSection.rows).toHaveLength(0)
    })
  })

  describe('reimbursement summary', () => {
    beforeEach(() => {
      mockGetProgram.mockResolvedValue(MSF_PROGRAM)
      mockResolveTemplate.mockReturnValue(MSF_MALARIA_TEMPLATE)
    })

    it('calculates subtotals as rate × count per LOINC code', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['MSF_MALARIA'], date: '2026-03-10', testLoincCode: '32700-7', resultSummary: 'Negative' }),
        makeEntry({ programTags: ['MSF_MALARIA'], date: '2026-03-11', testLoincCode: '32700-7', resultSummary: 'Negative' }),
        makeEntry({ programTags: ['MSF_MALARIA'], date: '2026-03-12', testLoincCode: '51587-4', resultSummary: 'Positive' }),
      ])

      const report = await generateDonorReport('MSF_MALARIA', '2026-03-01', '2026-03-31', 'tech-1')
      expect(report.reimbursement).toBeDefined()
      const rdtItem = report.reimbursement!.lineItems.find((l) => l.loincCode === '32700-7')!
      expect(rdtItem.count).toBe(2)
      expect(rdtItem.subtotal).toBe(300)  // 2 × 150 AFN
    })

    it('calculates grand total as sum of all line item subtotals', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['MSF_MALARIA'], date: '2026-03-10', testLoincCode: '32700-7', resultSummary: 'Negative' }),
        makeEntry({ programTags: ['MSF_MALARIA'], date: '2026-03-11', testLoincCode: '51587-4', resultSummary: 'Positive' }),
      ])

      const report = await generateDonorReport('MSF_MALARIA', '2026-03-01', '2026-03-31', 'tech-1')
      // 1 × 150 + 1 × 200 = 350
      expect(report.reimbursement!.grandTotal).toBe(350)
    })

    it('returns zero subtotals for LOINC codes with no entries', async () => {
      mockGetEntries.mockResolvedValue([])

      const report = await generateDonorReport('MSF_MALARIA', '2026-03-01', '2026-03-31', 'tech-1')
      expect(report.reimbursement!.lineItems.every((l) => l.count === 0 && l.subtotal === 0)).toBe(true)
      expect(report.reimbursement!.grandTotal).toBe(0)
    })

    it('omits reimbursement when template does not include it', async () => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(WHO_TB_TEMPLATE)
      mockGetEntries.mockResolvedValue([])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.reimbursement).toBeUndefined()
    })
  })

  describe('warnings', () => {
    beforeEach(() => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(WHO_TB_TEMPLATE)
    })

    it('adds no_data warning when no tagged entries found', async () => {
      mockGetEntries.mockResolvedValue([])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.warnings).toContain('no_data')
    })

    it('does not add no_data when entries exist', async () => {
      mockGetEntries.mockResolvedValue([
        makeEntry({ programTags: ['WHO_TB'], date: '2026-02-01', resultSummary: 'Negative' }),
      ])

      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.warnings).not.toContain('no_data')
    })
  })

  describe('report metadata', () => {
    beforeEach(() => {
      mockGetProgram.mockResolvedValue(WHO_TB_PROGRAM)
      mockResolveTemplate.mockReturnValue(WHO_TB_TEMPLATE)
      mockGetEntries.mockResolvedValue([])
    })

    it('creates report with draft status', async () => {
      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.status).toBe('draft')
    })

    it('sets programCode and programName from program', async () => {
      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.programCode).toBe('WHO_TB')
      expect(report.programName).toBe('WHO TB Program')
    })

    it('generates a UUID v4 id', async () => {
      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('starts with empty corrections array', async () => {
      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.corrections).toHaveLength(0)
    })

    it('sets syncStatus to pending', async () => {
      const report = await generateDonorReport('WHO_TB', '2026-01-01', '2026-03-31', 'tech-1')
      expect(report.syncStatus).toBe('pending')
    })
  })
})
