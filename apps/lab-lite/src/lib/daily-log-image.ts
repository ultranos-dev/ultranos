// ---------------------------------------------------------------------------
// Story 50.4 — Daily Activity Log Image Renderer
// Uses the native Canvas API (no library) for offline-first PNG generation.
// Output: 1080px wide PNG optimised for WhatsApp sharing.
// PHI Safety: only aggregate stats are rendered — no patient names or IDs.
// RTL: if locale is ar/prs/ps the entire layout mirrors (text-align right).
// ---------------------------------------------------------------------------

import type { DailyActivityLog } from './daily-log-types'

const WIDTH = 1080
const COLORS = {
  bg: '#FAFAFA',
  headerBg: '#1E3A5F',      // Ultranos dark blue
  headerText: '#FFFFFF',
  sectionTitle: '#1E3A5F',
  border: '#E2E8F0',
  tableHeader: '#F1F5F9',
  positive: '#16A34A',       // green
  negative: '#DC2626',       // red
  amber: '#D97706',          // amber
  text: '#1E293B',
  muted: '#64748B',
  alertBg: '#FEF2F2',
  alertText: '#991B1B',
  footerBg: '#F1F5F9',
}

const FONT = {
  title: 'bold 28px Inter, Arial, sans-serif',
  subtitle: '18px Inter, Arial, sans-serif',
  sectionHead: 'bold 15px Inter, Arial, sans-serif',
  tableHead: 'bold 13px Inter, Arial, sans-serif',
  body: '13px Inter, Arial, sans-serif',
  small: '11px Inter, Arial, sans-serif',
  watermark: 'bold 64px Inter, Arial, sans-serif',
}

const RTL_LOCALES = new Set(['ar', 'prs', 'ps'])

function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale)
}

/**
 * Compute the SHA-256 hash of the serialised log data (excluding imageBlob).
 * Returns a hex string. First 8 chars serve as the verification code.
 */
export async function computeLogHash(log: Omit<DailyActivityLog, 'imageBlob' | 'imageHash' | 'status' | 'id'>): Promise<string> {
  // Exclude volatile fields (generatedAt, generatedBy) so the same date's data
  // produces the same verification code regardless of when/who regenerates it.
  const json = JSON.stringify({
    logDate: log.logDate,
    facilityName: log.facilityName,
    testSummary: log.testSummary,
    workflowMetrics: log.workflowMetrics,
    turnaroundTime: log.turnaroundTime,
    rejections: log.rejections,
    stockoutAlerts: log.stockoutAlerts,
    equipmentStatus: log.equipmentStatus,
  })
  const encoded = new TextEncoder().encode(json)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Estimate image height based on content sections. */
function calculateImageHeight(log: DailyActivityLog): number {
  const base = 260 // header + footer + padding
  const testRows = Math.max(1, log.testSummary.length) * 28
  // Dynamic height for rejection reasons (each reason on its own line)
  const rejectionLines = Math.max(1, log.rejections.reasons.length)
  const rejectionsHeight = log.rejections.totalRejected > 0 ? 40 + rejectionLines * 20 : 60
  // Dynamic height for alerts: each stockout + each non-operational equipment entry
  const nonOperational = log.equipmentStatus.filter((e) => e.status !== 'operational')
  const alertCount = log.stockoutAlerts.length + nonOperational.length
  const alertsHeight = alertCount > 0 ? 60 + alertCount * 22 : 0
  return base + 200 + testRows + rejectionsHeight + alertsHeight
}

/** Draw a horizontal divider line. */
function drawDivider(ctx: CanvasRenderingContext2D, y: number, alpha = 1): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(32, y)
  ctx.lineTo(WIDTH - 32, y)
  ctx.stroke()
  ctx.restore()
}

/** Draw section title and return the next y offset. */
function drawSection(ctx: CanvasRenderingContext2D, title: string, y: number, rtl: boolean): number {
  ctx.font = FONT.sectionHead
  ctx.fillStyle = COLORS.sectionTitle
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillText(title.toUpperCase(), rtl ? WIDTH - 32 : 32, y)
  return y + 24
}

/**
 * Render the daily activity log as a PNG Blob.
 * @param log        Fully-populated DailyActivityLog (imageBlob may be absent)
 * @param options    locale for RTL, optional logoBlob
 */
export async function renderDailyLogImage(
  log: DailyActivityLog,
  options: { locale: string; logoBlob?: Blob; watermarkText?: string } = { locale: 'en' },
): Promise<Blob> {
  const rtl = isRtl(options.locale)
  const height = calculateImageHeight(log)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  if (rtl) {
    ctx.direction = 'rtl'
  }

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, WIDTH, height)

  // ── Header ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, 0, WIDTH, 90)

  // Optional logo
  if (options.logoBlob) {
    try {
      const imgUrl = URL.createObjectURL(options.logoBlob)
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, rtl ? WIDTH - 90 : 16, 8, 74, 74)
          URL.revokeObjectURL(imgUrl)
          resolve()
        }
        img.onerror = () => {
          URL.revokeObjectURL(imgUrl)
          resolve()
        }
        img.src = imgUrl
      })
    } catch {
      // logo unavailable — proceed without it
    }
  }

  // Facility name
  ctx.font = FONT.title
  ctx.fillStyle = COLORS.headerText
  ctx.textAlign = rtl ? 'right' : 'left'
  const nameX = rtl ? WIDTH - 32 : (options.logoBlob ? 104 : 32)
  ctx.fillText(log.facilityName, nameX, 38)

  // Subtitle
  ctx.font = FONT.subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  const dateDisplay = formatDate(log.logDate)
  ctx.fillText(`Daily Activity Report — ${dateDisplay}`, nameX, 66)

  let y = 106

  // ── Test Summary ──────────────────────────────────────────────────────────
  y = drawSection(ctx, 'Test Summary', y, rtl) + 4

  if (log.testSummary.length === 0) {
    ctx.font = FONT.body
    ctx.fillStyle = COLORS.muted
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillText('No tests recorded', rtl ? WIDTH - 32 : 32, y)
    y += 28
  } else {
    // Table header
    const cols = rtl
      ? [WIDTH - 32, WIDTH - 220, WIDTH - 350, WIDTH - 460]
      : [32, 220, 350, 460]

    ctx.fillStyle = COLORS.tableHeader
    ctx.fillRect(28, y - 4, WIDTH - 56, 24)

    ctx.font = FONT.tableHead
    ctx.fillStyle = COLORS.text
    const headers = ['Test Type', 'Total', 'Pos', 'Neg']
    for (let i = 0; i < headers.length; i++) {
      ctx.textAlign = i === 0 ? (rtl ? 'right' : 'left') : 'center'
      ctx.fillText(headers[i], cols[i], y + 12)
    }
    y += 28

    // Table rows
    for (const row of log.testSummary) {
      ctx.font = FONT.body
      ctx.fillStyle = COLORS.text
      ctx.textAlign = rtl ? 'right' : 'left'
      ctx.fillText(row.testLabel, cols[0], y)

      ctx.textAlign = 'center'
      ctx.fillText(String(row.totalPerformed), cols[1], y)

      ctx.fillStyle = row.totalPositive > 0 ? COLORS.positive : COLORS.muted
      ctx.fillText(row.totalPositive > 0 ? String(row.totalPositive) : '—', cols[2], y)

      ctx.fillStyle = row.totalNegative > 0 ? COLORS.text : COLORS.muted
      ctx.fillText(row.totalNegative > 0 ? String(row.totalNegative) : '—', cols[3], y)

      ctx.fillStyle = COLORS.text
      y += 28
    }
  }

  y += 8
  drawDivider(ctx, y)
  y += 16

  // ── Workflow ──────────────────────────────────────────────────────────────
  y = drawSection(ctx, 'Workflow', y, rtl) + 8

  const wm = log.workflowMetrics
  const metrics = [
    { label: 'Received', value: String(wm.samplesReceived) },
    { label: 'Completed', value: String(wm.samplesCompleted) },
    { label: 'Pending', value: String(wm.samplesPending), color: wm.samplesPending > 0 ? COLORS.amber : COLORS.text },
  ]
  const colW = (WIDTH - 64) / metrics.length
  for (let i = 0; i < metrics.length; i++) {
    const x = 32 + i * colW + colW / 2
    ctx.font = 'bold 22px Inter, Arial, sans-serif'
    ctx.fillStyle = metrics[i].color ?? COLORS.text
    ctx.textAlign = 'center'
    ctx.fillText(metrics[i].value, x, y + 24)
    ctx.font = FONT.body
    ctx.fillStyle = COLORS.muted
    ctx.fillText(metrics[i].label, x, y + 42)
  }

  y += 60

  // Completion rate
  ctx.font = FONT.body
  ctx.fillStyle = COLORS.text
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillText(`Completion Rate: ${wm.completionRate.toFixed(1)}%`, rtl ? WIDTH - 32 : 32, y)
  y += 24

  y += 8
  drawDivider(ctx, y)
  y += 16

  // ── Turnaround Time ───────────────────────────────────────────────────────
  y = drawSection(ctx, 'Turnaround Time', y, rtl) + 8

  const tat = log.turnaroundTime
  if (tat.sampleCount === 0) {
    ctx.font = FONT.body
    ctx.fillStyle = COLORS.muted
    ctx.textAlign = rtl ? 'right' : 'left'
    ctx.fillText('No turnaround time data available', rtl ? WIDTH - 32 : 32, y + 16)
    y += 32
  } else {
    const tatItems = [
      { label: 'Min', value: `${tat.minHours}h` },
      { label: 'Avg', value: `${tat.avgHours}h` },
      { label: 'Max', value: `${tat.maxHours}h` },
    ]
    const tatColW = (WIDTH - 64) / tatItems.length
    for (let i = 0; i < tatItems.length; i++) {
      const x = 32 + i * tatColW + tatColW / 2
      ctx.font = 'bold 18px Inter, Arial, sans-serif'
      ctx.fillStyle = COLORS.text
      ctx.textAlign = 'center'
      ctx.fillText(tatItems[i].value, x, y + 20)
      ctx.font = FONT.body
      ctx.fillStyle = COLORS.muted
      ctx.fillText(tatItems[i].label, x, y + 36)
    }
    y += 50
  }

  y += 8
  drawDivider(ctx, y)
  y += 16

  // ── Rejections ────────────────────────────────────────────────────────────
  y = drawSection(ctx, 'Rejections', y, rtl) + 8

  ctx.font = FONT.body
  ctx.fillStyle = log.rejections.totalRejected > 0 ? COLORS.negative : COLORS.text
  ctx.textAlign = rtl ? 'right' : 'left'
  ctx.fillText(`Total Rejected: ${log.rejections.totalRejected}`, rtl ? WIDTH - 32 : 32, y)
  y += 20

  if (log.rejections.reasons.length > 0) {
    const reasonText = log.rejections.reasons
      .map((r) => `${capitalise(r.reason)} (${r.count})`)
      .join(', ')
    ctx.font = FONT.small
    ctx.fillStyle = COLORS.muted
    ctx.fillText(reasonText, rtl ? WIDTH - 32 : 32, y)
    y += 20
  }

  y += 8

  // ── Alerts ────────────────────────────────────────────────────────────────
  const hasAlerts = log.stockoutAlerts.length > 0 || log.equipmentStatus.some((e) => e.status !== 'operational')
  if (hasAlerts) {
    drawDivider(ctx, y)
    y += 16
    y = drawSection(ctx, '⚠ Alerts', y, rtl) + 8

    ctx.fillStyle = COLORS.alertBg
    ctx.fillRect(28, y - 4, WIDTH - 56, 8 + (log.stockoutAlerts.length + log.equipmentStatus.length) * 22 + 8)

    for (const alert of log.stockoutAlerts) {
      ctx.font = FONT.body
      ctx.fillStyle = COLORS.alertText
      ctx.textAlign = rtl ? 'right' : 'left'
      ctx.fillText(`Stockout: ${alert}`, rtl ? WIDTH - 40 : 40, y + 18)
      y += 22
    }
    for (const eq of log.equipmentStatus) {
      if (eq.status !== 'operational') {
        ctx.font = FONT.body
        ctx.fillStyle = COLORS.alertText
        ctx.textAlign = rtl ? 'right' : 'left'
        ctx.fillText(`Equipment: ${eq.equipmentName} — ${eq.status}`, rtl ? WIDTH - 40 : 40, y + 18)
        y += 22
      }
    }
    y += 12
  }

  // ── Watermark ─────────────────────────────────────────────────────────────
  ctx.save()
  ctx.translate(WIDTH / 2, height / 2)
  ctx.rotate(-Math.PI / 6)
  ctx.globalAlpha = 0.06
  ctx.font = FONT.watermark
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.fillText(options.watermarkText || log.facilityName, 0, 0)
  ctx.restore()

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = height - 44
  ctx.fillStyle = COLORS.footerBg
  ctx.fillRect(0, footerY, WIDTH, 44)

  ctx.font = FONT.small
  ctx.fillStyle = COLORS.muted
  ctx.textAlign = 'left'
  ctx.fillText('Generated by Ultranos Lab Lite', 32, footerY + 16)

  const verifyCode = log.imageHash.slice(0, 8)
  const genTime = log.generatedAt.replace('T', ' ').slice(0, 19)
  ctx.textAlign = 'right'
  ctx.fillText(`${genTime}  |  verify: ${verifyCode}`, WIDTH - 32, footerY + 16)

  ctx.font = FONT.small
  ctx.fillStyle = COLORS.border
  ctx.textAlign = 'center'
  ctx.fillText(log.logDate, WIDTH / 2, footerY + 36)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob returned null'))
      },
      'image/png',
    )
  })
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
