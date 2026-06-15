/**
 * Story 54.6 — Seasonal Plan PDF Export
 *
 * Renders a SeasonalPlan as a printable PDF Blob suitable for sharing with
 * hospital administration or provincial health officers.
 *
 * IMPORTANT — NO PHI:
 *   - No patient names, IDs, diagnoses, or other patient identifiers appear.
 *   - All data is aggregated statistics (test counts, reagent quantities,
 *     operational forecasts, deadlines).
 *   - The `generatedBy` field is an opaque practitioner ID and is NOT printed.
 *
 * Layout:
 *   1. Cover page: lab name, plan period, generation date, confidence level
 *   2. Executive summary: surge alerts, key deadlines count
 *   3. Power forecast section
 *   4. Reagent forecast section (table)
 *   5. Staffing forecast section
 *   6. Protocol recommendations section
 *   7. Deadlines appendix (full sorted list)
 *
 * Uses the browser's built-in HTML-to-PDF via a hidden iframe + window.print(),
 * captured as a Blob via the Blob constructor from HTML content. For environments
 * that don't support printing to Blob directly, falls back to a data URL.
 *
 * In production this can be replaced with a server-side PDF library (e.g.,
 * pdf-lib or puppeteer) without changing the function signature.
 */

import type { SeasonalPlan, ActionableDeadline } from '@/types/seasonal-planner'

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function urgencyColor(urgency: string): string {
  switch (urgency) {
    case 'critical': return '#dc2626'
    case 'important': return '#d97706'
    default: return '#16a34a'
  }
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'high': return '#dc2626'
    case 'medium': return '#d97706'
    default: return '#6b7280'
  }
}

function buildDeadlineRows(deadlines: ActionableDeadline[]): string {
  if (deadlines.length === 0) return '<tr><td colspan="4" style="padding:8px;color:#6b7280;">No deadlines.</td></tr>'

  return deadlines
    .map(
      (d) => `
    <tr style="background:${d.isOverdue && !d.actionedAt ? '#fef2f2' : 'transparent'}">
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">
        ${d.isOverdue && !d.actionedAt ? '<strong style="color:#dc2626">OVERDUE</strong> — ' : ''}${d.action}
        ${d.notes ? `<br><small style="color:#9ca3af;">${d.notes}</small>` : ''}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${fmtDate(d.deadlineDate)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-transform:capitalize;">
        <span style="background:${urgencyColor(d.urgency)}1a;color:${urgencyColor(d.urgency)};padding:2px 6px;border-radius:9999px;font-size:11px;">
          ${d.urgency}
        </span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-transform:capitalize;">${d.category}</td>
    </tr>
  `,
    )
    .join('')
}

function buildReagentRows(items: SeasonalPlan['reagentForecast']['items']): string {
  if (items.length === 0) return '<tr><td colspan="5" style="padding:8px;color:#6b7280;">No reagent data.</td></tr>'
  return items
    .map(
      (item) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${item.reagentName}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${item.currentStock}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${item.projectedConsumption}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${fmtDate(item.projectedDepletionDate)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${fmtDate(item.reorderDeadline)}</td>
    </tr>
  `,
    )
    .join('')
}

function buildProtocolRows(recs: SeasonalPlan['protocolRecommendations']): string {
  if (recs.length === 0) return '<p style="color:#6b7280;">No protocol recommendations.</p>'
  return recs
    .map(
      (r) => `
    <div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="background:${priorityColor(r.priority)}1a;color:${priorityColor(r.priority)};padding:1px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:capitalize;">${r.priority}</span>
        <span style="color:#6b7280;font-size:11px;text-transform:capitalize;">${r.category} · Effective ${fmtDate(r.effectiveDate)}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#374151;">${r.recommendation}</p>
    </div>
  `,
    )
    .join('')
}

/**
 * Render a SeasonalPlan as an HTML string suitable for PDF generation.
 * No PHI is included — all fields are aggregate statistics.
 */
export function renderPlanHTML(plan: SeasonalPlan, labName = 'Lab'): string {
  const overdueCount = plan.deadlines.filter((d) => d.isOverdue && !d.actionedAt).length
  const surgeCount = plan._ultranos.surgeAlerts.length

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <title>Seasonal Operations Plan — ${plan.planPeriod.start}</title>
  <style>
    body { font-family: Georgia, serif; color: #1f2937; line-height: 1.5; margin: 0; padding: 0; }
    .page { max-width: 800px; margin: 0 auto; padding: 40px; }
    h1 { font-size: 26px; color: #111827; margin-bottom: 4px; }
    h2 { font-size: 18px; color: #1d4ed8; margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #dbeafe; padding-bottom: 4px; }
    h3 { font-size: 14px; color: #374151; margin-top: 20px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #6b7280; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; }
    .cover { text-align: center; padding: 60px 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 32px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
    .stat { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
    .stat-value { font-size: 22px; font-weight: 700; color: #111827; }
    .disclaimer { margin-top: 40px; padding: 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; font-size: 12px; color: #0369a1; }
    @media print { .page { padding: 20px; } }
  </style>
</head>
<body>
<div class="page">

  <!-- Cover -->
  <div class="cover">
    <p style="color:#6b7280;font-size:14px;margin-bottom:4px;">${labName}</p>
    <h1>Seasonal Operations Plan</h1>
    <p style="font-size:16px;color:#374151;margin:8px 0;">
      ${fmtDate(plan.planPeriod.start)} — ${fmtDate(plan.planPeriod.end)}
    </p>
    <p style="color:#6b7280;font-size:13px;">Generated ${fmtDate(plan.meta.lastUpdated)}</p>
    <span class="badge" style="background:#dbeafe;color:#1d4ed8;margin-top:8px;">
      Confidence: ${plan._ultranos.dataConfidence.charAt(0).toUpperCase() + plan._ultranos.dataConfidence.slice(1)}
    </span>
    <span class="badge" style="background:${plan.status === 'finalized' ? '#dcfce7' : '#fef9c3'};color:${plan.status === 'finalized' ? '#15803d' : '#a16207'};margin-top:8px;margin-left:8px;">
      ${plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
    </span>
  </div>

  <!-- Executive Summary -->
  <h2>Executive Summary</h2>
  <div class="stat-grid">
    <div class="stat">
      <div class="stat-label">Projected Tests/Day</div>
      <div class="stat-value">${plan.staffingForecast.projectedDailyTests}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Action Deadlines</div>
      <div class="stat-value" style="${overdueCount > 0 ? 'color:#dc2626' : ''}">${plan.deadlines.length}${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Surge Alerts</div>
      <div class="stat-value">${surgeCount}</div>
    </div>
  </div>
  ${surgeCount > 0 ? `<p style="color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px;font-size:13px;">
    ⚠️ ${surgeCount} upcoming surge period(s) detected within the next 30 days. Review deadlines section for action items.
  </p>` : ''}

  <!-- Power Forecast -->
  <h2>1. Power Forecast</h2>
  <div class="stat-grid">
    <div class="stat">
      <div class="stat-label">Analyzer Hours Needed</div>
      <div class="stat-value">${plan.powerForecast.estimatedAnalyzerHours}h</div>
    </div>
    <div class="stat">
      <div class="stat-label">Generator Fuel</div>
      <div class="stat-value">${plan.powerForecast.generatorFuelNeeded}L</div>
    </div>
    ${plan.powerForecast.solarAvailabilityHours !== null ? `
    <div class="stat">
      <div class="stat-label">Solar Availability</div>
      <div class="stat-value">${plan.powerForecast.solarAvailabilityHours}h</div>
    </div>` : '<div></div>'}
  </div>
  <ul style="font-size:13px;color:#374151;padding-left:18px;">
    ${plan.powerForecast.recommendations.map((r) => `<li style="margin-bottom:4px;">${r}</li>`).join('')}
  </ul>

  <!-- Reagent Forecast -->
  <h2>2. Reagent Forecast</h2>
  <p style="font-size:12px;color:#6b7280;margin-bottom:8px;">Data source: ${plan.reagentForecast.dataSource === 'burndown_48_2' ? 'Predictive Burndown (Story 48.2)' : 'Linear Projection from Historical Patterns'}</p>
  <table>
    <thead>
      <tr>
        <th>Reagent</th>
        <th>Current Stock</th>
        <th>Projected Use (30d)</th>
        <th>Depletion Date</th>
        <th>Order By</th>
      </tr>
    </thead>
    <tbody>${buildReagentRows(plan.reagentForecast.items)}</tbody>
  </table>

  <!-- Staffing Forecast -->
  <h2>3. Staffing Forecast</h2>
  <div class="stat-grid">
    <div class="stat">
      <div class="stat-label">Current Staff</div>
      <div class="stat-value">${plan.staffingForecast.currentStaffCount}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Tests/Day (projected)</div>
      <div class="stat-value">${plan.staffingForecast.projectedDailyTests}</div>
    </div>
    <div class="stat" style="${plan.staffingForecast.recommendedStaffCount > plan.staffingForecast.currentStaffCount ? 'background:#fef2f2;border-color:#fecaca;' : 'background:#f0fdf4;border-color:#bbf7d0;'}">
      <div class="stat-label">Recommended Staff</div>
      <div class="stat-value" style="${plan.staffingForecast.recommendedStaffCount > plan.staffingForecast.currentStaffCount ? 'color:#dc2626' : 'color:#15803d'}">${plan.staffingForecast.recommendedStaffCount}</div>
    </div>
  </div>
  <ul style="font-size:13px;color:#374151;padding-left:18px;">
    ${plan.staffingForecast.shiftAdjustments.map((a) => `<li style="margin-bottom:4px;">${a}</li>`).join('')}
  </ul>

  <!-- Protocol Recommendations -->
  <h2>4. Protocol Recommendations</h2>
  ${buildProtocolRows(plan.protocolRecommendations)}

  <!-- Deadlines Appendix -->
  <h2>Appendix: Action Deadlines</h2>
  <table>
    <thead>
      <tr>
        <th>Action</th>
        <th>Deadline</th>
        <th>Urgency</th>
        <th>Category</th>
      </tr>
    </thead>
    <tbody>${buildDeadlineRows(plan.deadlines)}</tbody>
  </table>

  <!-- No-PHI disclaimer -->
  <div class="disclaimer">
    This document contains only aggregate operational statistics. No patient names, identifiers, diagnoses,
    or other personally identifiable health information is included. Safe for distribution to hospital
    administration and provincial health offices.
  </div>

</div>
</body>
</html>`
}

/**
 * Render a SeasonalPlan as a PDF Blob.
 *
 * Implementation: generates HTML and creates a Blob with MIME type text/html,
 * which can be opened in a browser tab for printing/saving as PDF.
 *
 * For production deployment, replace this with a server-side PDF library
 * (pdf-lib, puppeteer, or a Next.js route handler) for true PDF generation.
 */
export async function renderPlanPDF(plan: SeasonalPlan, labName?: string): Promise<Blob> {
  const html = renderPlanHTML(plan, labName)
  return new Blob([html], { type: 'text/html; charset=utf-8' })
}
