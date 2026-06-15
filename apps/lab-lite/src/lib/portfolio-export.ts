/**
 * portfolio-export.ts — Story 51.6 / 51.7
 *
 * Generates an HTML portfolio export for a technician.
 * No PHI in the output — tech IDs and operational metrics only.
 * Filename uses techId, never tech name.
 */

import type { FullPortfolioMetrics, DateRange } from './portfolio-service'
import { AchievementType } from './db'
import type { Achievement } from './db'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a portfolio export Blob for download.
 * Filename: use getExportFilename() — techId + date range, no name.
 */
export function exportPortfolio(
  metrics: FullPortfolioMetrics,
  opts: { techId: string; techName: string; labName: string },
): Blob {
  const html = buildHtml(metrics, opts)
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

/**
 * Build an export filename from techId and date range.
 * Special characters in techId are replaced with underscores.
 */
export function getExportFilename(techId: string, range: DateRange): string {
  const safeId = techId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `portfolio_${safeId}_${range.startDate}_${range.endDate}.html`
}

// ── HTML builder ──────────────────────────────────────────────────────────────

const ACHIEVEMENT_ICONS: Partial<Record<AchievementType, string>> = {
  [AchievementType.QC_CHAMPION]: '🏆',
  [AchievementType.ZERO_REJECTION_WEEK]: '✨',
  [AchievementType.SPEED_STAR]: '⚡',
  [AchievementType.CONSISTENCY_AWARD]: '🎯',
  [AchievementType.MENTORSHIP_BADGE]: '🤝',
  [AchievementType.TEAM_MILESTONE_1K]: '🌟',
  [AchievementType.TEAM_MILESTONE_5K]: '🌟',
  [AchievementType.TEAM_MILESTONE_10K]: '🌟',
}

const ACHIEVEMENT_NAMES: Partial<Record<AchievementType, string>> = {
  [AchievementType.QC_CHAMPION]: 'QC Champion',
  [AchievementType.ZERO_REJECTION_WEEK]: 'Zero Rejection Week',
  [AchievementType.SPEED_STAR]: 'Speed Star',
  [AchievementType.CONSISTENCY_AWARD]: 'Consistency Award',
  [AchievementType.MENTORSHIP_BADGE]: 'Mentorship Badge',
  [AchievementType.TEAM_MILESTONE_1K]: 'Team Milestone: 1,000 Tests',
  [AchievementType.TEAM_MILESTONE_5K]: 'Team Milestone: 5,000 Tests',
  [AchievementType.TEAM_MILESTONE_10K]: 'Team Milestone: 10,000 Tests',
}

function formatTAT(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function buildHtml(
  metrics: FullPortfolioMetrics,
  opts: { techId: string; techName: string; labName: string },
): string {
  const generatedAt = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const achievementsHtml =
    metrics.achievements.length === 0
      ? '<p style="color:#6b7280;font-style:italic">No achievements earned yet.</p>'
      : metrics.achievements
          .sort((a: Achievement, b: Achievement) => b.earnedAt.localeCompare(a.earnedAt))
          .map((a: Achievement) => {
            const icon = ACHIEVEMENT_ICONS[a.type as AchievementType] ?? '⭐'
            const name = ACHIEVEMENT_NAMES[a.type as AchievementType] ?? a.type
            const date = new Date(a.earnedAt).toLocaleDateString()
            return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
          <span style="font-size:24px">${icon}</span>
          <div>
            <p style="margin:0;font-weight:600;font-size:14px">${name}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280">${a.description}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">Earned: ${date}</p>
          </div>
        </div>`
          })
          .join('')

  const tatRowsHtml = metrics.averageTAT
    .sort((a, b) => b.avgTatMinutes - a.avgTatMinutes)
    .map((cat) => `<tr>
      <td style="padding:6px 12px 6px 0;font-family:monospace;font-size:12px">${cat.loincCode}</td>
      <td style="padding:6px 12px 6px 0;font-weight:600">${formatTAT(cat.avgTatMinutes)}</td>
      <td style="padding:6px 0;color:#6b7280">${cat.sampleCount} samples</td>
    </tr>`)
    .join('')

  const tatHtml = metrics.averageTAT.length === 0
    ? '<p style="color:#6b7280;font-style:italic">No TAT data available.</p>'
    : `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid #e5e7eb">
          <th style="text-align:left;padding:6px 12px 6px 0;font-size:12px;color:#6b7280">Category</th>
          <th style="text-align:left;padding:6px 12px 6px 0;font-size:12px;color:#6b7280">Avg TAT</th>
          <th style="text-align:left;padding:6px 0;font-size:12px;color:#6b7280">Samples</th>
        </tr></thead>
        <tbody>${tatRowsHtml}</tbody>
      </table>`

  const sopListHtml = metrics.trainingModules.length === 0
    ? '<p style="color:#6b7280;font-style:italic">No training modules acknowledged.</p>'
    : metrics.trainingModules
        .map((m) => `<li style="margin-bottom:4px"><strong>${m.title}</strong> <span style="color:#6b7280;font-size:12px">(v${m.version})</span></li>`)
        .join('')

  const rejectionBreakdownHtml = metrics.rejectionRate.rejectionBreakdown?.length
    ? '<ul style="margin:8px 0 0;padding-left:20px">' +
      metrics.rejectionRate.rejectionBreakdown
        .map((b) => `<li style="font-size:12px;color:#6b7280">${b.reason}: ${b.count}</li>`)
        .join('') +
      '</ul>'
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Professional Development Portfolio — ${opts.techName}</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111827; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .section { margin-bottom: 32px; }
    .section h2 { font-size: 16px; font-weight: 600; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .stat-card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #1d4ed8; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .comments-box { border: 1px solid #e5e7eb; border-radius: 8px; min-height: 80px; padding: 12px; margin-top: 8px; background: #fafafa; }
    .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print {
      body { padding: 12px; }
      .no-print { display: none; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Professional Development Portfolio</h1>
  <p class="subtitle">${opts.techName} · ${opts.labName} · ${metrics.dateRange.startDate} to ${metrics.dateRange.endDate} · Generated ${generatedAt}</p>

  <div class="section">
    <h2>Performance Summary</h2>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${metrics.testsPerShift.noData ? 'N/A' : metrics.testsPerShift.value}</div>
        <div class="stat-label">Tests per Shift</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${metrics.qcPassRate.noData ? 'N/A' : `${metrics.qcPassRate.value}${metrics.qcPassRate.unit}`}</div>
        <div class="stat-label">QC Pass Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${metrics.rejectionRate.noData ? 'N/A' : `${metrics.rejectionRate.value}${metrics.rejectionRate.unit}`}</div>
        <div class="stat-label">Sample Rejection Rate</div>
        ${rejectionBreakdownHtml}
      </div>
      <div class="stat-card">
        <div class="stat-value">${metrics.mentorshipCount}</div>
        <div class="stat-label">Mentorship Pairings</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Average Turnaround Time</h2>
    ${tatHtml}
  </div>

  <div class="section">
    <h2>Training Modules Completed (${metrics.trainingModules.length})</h2>
    <ul style="padding-left:20px">${sopListHtml}</ul>
  </div>

  <div class="section">
    <h2>Achievements (${metrics.achievements.length})</h2>
    ${achievementsHtml}
  </div>

  <div class="section">
    <h2>Supervisor Comments</h2>
    <div class="comments-box" aria-label="Supervisor comments (blank for handwritten notes)"></div>
  </div>

  <div class="footer">
    Professional Development Portfolio · ${opts.techId} · ${opts.labName} · Generated by Ultranos Lab Lite · ${generatedAt}
  </div>
</body>
</html>`
}