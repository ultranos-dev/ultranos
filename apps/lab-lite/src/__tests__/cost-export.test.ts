import { describe, it, expect } from 'vitest'
import { buildCostAnalysisCSV } from '../lib/cost-export'
import type { CostAnalysis } from '../lib/cost-calculator'

function makeAnalysis(overrides: Partial<CostAnalysis> = {}): CostAnalysis {
  return {
    testCode: '58410-2',
    testName: 'Blood Work — CBC',
    reagentCostPerTest: 50,
    consumableCost: 20,
    laborAllocation: 30,
    overheadAllocation: 35,
    totalCost: 135,
    currentPrice: 200,
    margin: 65,
    marginPercent: 32.5,
    isProfitable: true,
    lastUpdated: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildCostAnalysisCSV', () => {
  it('starts with UTF-8 BOM for Excel compatibility', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('includes the correct column headers', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis()])
    const headerLine = csv.slice(1).split('\r\n')[0]
    expect(headerLine).toContain('Test Name')
    expect(headerLine).toContain('LOINC Code')
    expect(headerLine).toContain('Reagent Cost (AFN)')
    expect(headerLine).toContain('Consumable Cost (AFN)')
    expect(headerLine).toContain('Labor Cost (AFN)')
    expect(headerLine).toContain('Overhead Cost (AFN)')
    expect(headerLine).toContain('Total Cost (AFN)')
    expect(headerLine).toContain('Price Charged (AFN)')
    expect(headerLine).toContain('Margin (AFN)')
    expect(headerLine).toContain('Margin (%)')
    expect(headerLine).toContain('Status')
  })

  it('writes one data row per analysis', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis(), makeAnalysis({ testCode: 'X-001', testName: 'Lipid Panel' })])
    const lines = csv.slice(1).split('\r\n').filter(Boolean)
    // header + 2 data rows
    expect(lines).toHaveLength(3)
  })

  it('formats AFN values with 2 decimal places', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis({ reagentCostPerTest: 50 })])
    expect(csv).toContain('50.00')
  })

  it('labels profitable tests as "Profitable"', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis({ isProfitable: true })])
    expect(csv).toContain('Profitable')
  })

  it('labels subsidized tests as "Subsidized"', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis({ isProfitable: false, margin: -35, marginPercent: -35 })])
    expect(csv).toContain('Subsidized')
  })

  it('writes N/A for null marginPercent (zero-price test)', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis({ marginPercent: null })])
    expect(csv).toContain('N/A')
  })

  it('escapes commas in test names', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis({ testName: 'Test, Special' })])
    expect(csv).toContain('"Test, Special"')
  })

  it('uses CRLF line endings', () => {
    const csv = buildCostAnalysisCSV([makeAnalysis()])
    expect(csv).toContain('\r\n')
  })

  it('returns header-only (with BOM) for empty array', () => {
    const csv = buildCostAnalysisCSV([])
    const lines = csv.slice(1).split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // just the header
  })
})
