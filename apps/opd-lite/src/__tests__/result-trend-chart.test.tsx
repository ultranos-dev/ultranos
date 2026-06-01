/**
 * Tests for Story 52.4 — ResultTrendChart and ResultSummaryTable
 *
 * Covers:
 * - Trend chart renders with normal, abnormal, and critical data points (AC 3)
 * - Data points are colored by flag level
 * - Non-numeric fallback table renders correctly
 * - RTL: chart always renders LTR (direction:ltr)
 * - Empty state
 * - Single-point state
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultTrendChart, ResultSummaryTable } from '@/components/clinical/ResultTrendChart'
import type { TrendDataPoint } from '@/lib/lab-results/result-grouper'

function makePoint(
  daysAgo: number,
  value: number,
  unit: string,
  flagLevel: TrendDataPoint['flagLevel'],
  labName = 'Lab Alpha',
): TrendDataPoint {
  return {
    date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    value,
    unit,
    flagLevel,
    labName,
  }
}

describe('ResultTrendChart', () => {
  it('renders SVG chart with correct data-testid', () => {
    const points = [
      makePoint(30, 5.6, 'mmol/L', 'normal'),
      makePoint(10, 6.2, 'mmol/L', 'abnormal'),
      makePoint(2, 7.1, 'mmol/L', 'critical'),
    ]
    render(<ResultTrendChart trendData={points} label="Glucose" />)

    expect(screen.getByTestId('trend-chart')).toBeInTheDocument()
  })

  it('renders one circle per data point', () => {
    const points = [
      makePoint(30, 5.6, 'mmol/L', 'normal'),
      makePoint(10, 6.2, 'mmol/L', 'abnormal'),
      makePoint(2, 7.1, 'mmol/L', 'critical'),
    ]
    render(<ResultTrendChart trendData={points} label="Glucose" />)

    // 3 data points = 3 circles
    expect(screen.getByTestId('trend-point-0')).toBeInTheDocument()
    expect(screen.getByTestId('trend-point-1')).toBeInTheDocument()
    expect(screen.getByTestId('trend-point-2')).toBeInTheDocument()
  })

  it('data points have accessible aria-label with value and flag level', () => {
    const points = [
      makePoint(30, 11.0, 'g/dL', 'normal', 'Lab Alpha'),
      makePoint(5, 12.5, 'g/dL', 'normal', 'Lab Beta'),
    ]
    render(<ResultTrendChart trendData={points} label="Hemoglobin" />)

    // Chart renders oldest→newest (left→right), so point-1 is the newer 12.5 g/dL entry
    const point = screen.getByTestId('trend-point-1')
    expect(point.getAttribute('aria-label')).toContain('12.5 g/dL')
    expect(point.getAttribute('aria-label')).toContain('normal')
    expect(point.getAttribute('aria-label')).toContain('Lab Beta')
  })

  it('renders direction:ltr regardless of page direction (RTL test)', () => {
    const points = [
      makePoint(10, 5.0, 'mmol/L', 'normal'),
      makePoint(2, 5.5, 'mmol/L', 'normal'),
    ]
    render(
      <div dir="rtl">
        <ResultTrendChart trendData={points} label="Glucose" />
      </div>,
    )

    const chart = screen.getByTestId('trend-chart')
    expect(chart).toHaveStyle({ direction: 'ltr' })
  })

  it('shows tooltip when a point is hovered', () => {
    const p = makePoint(5, 7.2, '%', 'abnormal', 'Lab Gamma')
    render(
      <ResultTrendChart
        trendData={[p, makePoint(30, 6.8, '%', 'normal')]}
        label="HbA1c"
        hoveredPoint={p}
        onPointHover={vi.fn()}
      />,
    )

    expect(screen.getByTestId('trend-tooltip')).toBeInTheDocument()
    expect(screen.getByTestId('trend-tooltip')).toHaveTextContent('7.2 %')
    expect(screen.getByTestId('trend-tooltip')).toHaveTextContent('Lab Gamma')
  })

  it('renders empty state when trendData is empty', () => {
    render(<ResultTrendChart trendData={[]} label="Test" />)
    expect(screen.getByTestId('trend-chart-empty')).toBeInTheDocument()
  })

  it('renders single-point state when only one data point', () => {
    const p = makePoint(5, 3.5, 'g/dL', 'normal')
    render(<ResultTrendChart trendData={[p]} label="Hemoglobin" />)
    expect(screen.getByTestId('trend-chart-single')).toBeInTheDocument()
  })

  it('calls onPointHover when a data point is hovered', () => {
    const onHover = vi.fn()
    const points = [
      makePoint(10, 5.6, 'mmol/L', 'normal'),
      makePoint(2, 6.0, 'mmol/L', 'abnormal'),
    ]
    render(
      <ResultTrendChart
        trendData={points}
        label="Glucose"
        onPointHover={onHover}
      />,
    )

    fireEvent.mouseEnter(screen.getByTestId('trend-point-0'))
    expect(onHover).toHaveBeenCalledWith(expect.objectContaining({ value: expect.any(Number) }))
  })
})

describe('ResultSummaryTable — non-numeric fallback', () => {
  it('renders result rows with date and summary', () => {
    const rows = [
      { date: new Date().toISOString(), summary: 'Clear, pale yellow', flagLevel: 'normal' },
      { date: new Date(Date.now() - 30 * 86400000).toISOString(), summary: 'Cloudy', flagLevel: 'abnormal' },
    ]
    render(<ResultSummaryTable results={rows} />)

    expect(screen.getByTestId('result-summary-table')).toBeInTheDocument()
    expect(screen.getByText('Clear, pale yellow')).toBeInTheDocument()
    expect(screen.getByText('Cloudy')).toBeInTheDocument()
  })

  it('applies red text for critical rows', () => {
    const rows = [
      { date: new Date().toISOString(), summary: 'Urgent finding', flagLevel: 'critical' },
    ]
    render(<ResultSummaryTable results={rows} />)

    const cell = screen.getByText('Urgent finding')
    expect(cell).toHaveClass('text-red-700')
  })

  it('applies amber text for abnormal rows', () => {
    const rows = [
      { date: new Date().toISOString(), summary: 'Slightly elevated', flagLevel: 'abnormal' },
    ]
    render(<ResultSummaryTable results={rows} />)

    const cell = screen.getByText('Slightly elevated')
    expect(cell).toHaveClass('text-amber-700')
  })

  it('returns null when results array is empty', () => {
    const { container } = render(<ResultSummaryTable results={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
