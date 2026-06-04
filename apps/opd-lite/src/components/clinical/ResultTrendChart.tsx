'use client'

/**
 * Trend Visualization Component (Story 52.4 — Task 4)
 *
 * SVG sparkline for numeric result trends within a test category.
 * Time axis always reads left-to-right regardless of page direction (medical convention).
 * Fallback to tabular view for non-numeric results.
 *
 * RTL: chart reads LTR — time axis is universal for medical data.
 * CLAUDE.md Rule #4 (allergy prominence precedent): critical values get colored data points.
 */

import type { TrendDataPoint } from '@/lib/lab-results/result-grouper'

interface ResultTrendChartProps {
  trendData: TrendDataPoint[]
  /** Test category display name */
  label: string
  /** Width in pixels (default 280) */
  width?: number
  /** Height in pixels (default 64) */
  height?: number
  /** Called when a data point is tapped/hovered */
  onPointHover?: (point: TrendDataPoint | null) => void
  /** Currently hovered point (controlled) */
  hoveredPoint?: TrendDataPoint | null
}

const FLAG_COLORS: Record<string, string> = {
  normal: '#16a34a',    // green-600
  abnormal: '#d97706',  // amber-600
  critical: '#dc2626',  // red-600
}

const PADDING = { top: 8, right: 12, bottom: 20, left: 8 }

function getColor(flagLevel: string): string {
  return FLAG_COLORS[flagLevel] ?? FLAG_COLORS['normal']!
}

/**
 * Compute SVG path for the sparkline.
 * Points are sorted chronologically (oldest → newest, left → right).
 */
function buildSparklinePath(
  points: { x: number; y: number }[],
): string {
  if (points.length < 2) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
}

export function ResultTrendChart({
  trendData,
  label,
  width = 280,
  height = 64,
  onPointHover,
  hoveredPoint,
}: ResultTrendChartProps) {
  const innerW = width - PADDING.left - PADDING.right
  const innerH = height - PADDING.top - PADDING.bottom

  // Sort oldest → newest for left-to-right rendering
  const sorted = [...trendData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  if (sorted.length === 0) {
    return (
      <div
        className="text-xs text-muted-foreground italic"
        data-testid="trend-chart-empty"
      >
        No trend data
      </div>
    )
  }

  // Non-numeric fallback: render as table of result summaries
  // (called from PatientResultTimeline for non-numeric categories)
  if (sorted.length < 2) {
    return (
      <div className="text-xs text-muted-foreground" data-testid="trend-chart-single">
        {sorted[0] && (
          <span>
            {sorted[0].value} {sorted[0].unit} on{' '}
            {new Date(sorted[0].date).toLocaleDateString()}
          </span>
        )}
      </div>
    )
  }

  const values = sorted.map((p) => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1 // avoid division by zero

  // Map data → SVG coordinates
  const svgPoints = sorted.map((p, i) => ({
    x: PADDING.left + (i / (sorted.length - 1)) * innerW,
    y: PADDING.top + ((maxVal - p.value) / valRange) * innerH,
    point: p,
  }))

  const linePath = buildSparklinePath(svgPoints)

  // Y-axis range labels
  const yMin = minVal.toFixed(1)
  const yMax = maxVal.toFixed(1)
  const unit = sorted[0]?.unit ?? ''

  return (
    <div
      className="relative"
      style={{ direction: 'ltr' }}
      data-testid="trend-chart"
      aria-label={`${label} trend chart: ${sorted.length} data points`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        {/* Sparkline */}
        <path
          d={linePath}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {svgPoints.map(({ x, y, point }, i) => {
          const color = getColor(point.flagLevel)
          const isHovered = hoveredPoint?.date === point.date
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isHovered ? 5 : 3.5}
              fill={color}
              stroke="white"
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              data-testid={`trend-point-${i}`}
              onMouseEnter={() => onPointHover?.(point)}
              onMouseLeave={() => onPointHover?.(null)}
              onFocus={() => onPointHover?.(point)}
              onBlur={() => onPointHover?.(null)}
              tabIndex={0}
              aria-label={`${point.value} ${point.unit} on ${new Date(point.date).toLocaleDateString()} from ${point.labName} — ${point.flagLevel}`}
            />
          )
        })}

        {/* Y-axis min/max labels */}
        <text
          x={PADDING.left}
          y={height - 4}
          fontSize={9}
          fill="#94a3b8"
          textAnchor="start"
        >
          {yMin}
        </text>
        <text
          x={PADDING.left}
          y={PADDING.top + 9}
          fontSize={9}
          fill="#94a3b8"
          textAnchor="start"
        >
          {yMax}
        </text>
        {unit && (
          <text
            x={width - PADDING.right}
            y={height - 4}
            fontSize={9}
            fill="#94a3b8"
            textAnchor="end"
          >
            {unit}
          </text>
        )}
      </svg>

      {/* Tooltip for hovered point */}
      {hoveredPoint && (
        <div
          className="absolute top-0 start-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-secondary px-2 py-1 text-xs text-white shadow-lg"
          style={{ pointerEvents: 'none' }}
          data-testid="trend-tooltip"
          role="tooltip"
        >
          <span className="font-semibold">
            {hoveredPoint.value} {hoveredPoint.unit}
          </span>
          {' · '}
          {new Date(hoveredPoint.date).toLocaleDateString()}
          {' · '}
          {hoveredPoint.labName}
        </div>
      )}
    </div>
  )
}

/**
 * Non-numeric fallback: table of result summaries over time.
 * Shown when numeric extraction fails for the category (e.g. urinalysis).
 *
 * AC: 4 (Story 52.4 — fallback for non-numeric)
 */
export function ResultSummaryTable({
  results,
}: {
  results: { date: string; summary: string; flagLevel?: string }[]
}) {
  if (results.length === 0) return null
  return (
    <table
      className="w-full text-xs text-foreground"
      data-testid="result-summary-table"
      aria-label="Result history"
    >
      <thead>
        <tr className="border-b border-neutral-100">
          <th className="py-1 text-start font-medium text-muted-foreground">Date</th>
          <th className="py-1 text-start font-medium text-muted-foreground">Result</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => (
          <tr key={i} className="border-b border-neutral-50">
            <td className="py-1 text-muted-foreground">
              {new Date(r.date).toLocaleDateString()}
            </td>
            <td
              className={`py-1 font-medium ${
                r.flagLevel === 'critical'
                  ? 'text-destructive'
                  : r.flagLevel === 'abnormal'
                  ? 'text-warning'
                  : 'text-foreground'
              }`}
            >
              {r.summary}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
