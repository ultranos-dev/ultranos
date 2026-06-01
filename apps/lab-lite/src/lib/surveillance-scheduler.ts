/**
 * Surveillance Scheduler — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Lightweight scheduler that:
 * 1. Runs spike detection daily at configurable hour (default: 08:00 local)
 * 2. Runs cluster detection after every result authorization (real-time)
 * 3. Generates SurveillanceAlert records in Dexie
 * 4. Enqueues alerts to syncQueue for Hub transmission
 * 5. Dispatches in-app notifications to the tech
 *
 * Uses setInterval with lastRunAt persistence — NOT a full cron library.
 * Runs only when the app is open (browser tab active).
 *
 * PHI Safety (CLAUDE.md Rule #1):
 * - Alert payloads contain aggregate counts, rates, and lab metadata ONLY.
 * - No patient names, IDs, or individual results are included in any alert.
 */

import { v4 as uuidv4 } from 'uuid'
import type { SurveillanceAlert } from './surveillance-types'
import {
  getActiveReportableDiseases,
  saveSurveillanceAlert,
  getSurveillanceSchedulerConfig,
  putSurveillanceSchedulerConfig,
  getRecentClusterAlerts,
  enqueueSyncEvent,
  getDb,
} from './db'
import { detectPositivitySpike, detectDiseaseCluster } from './surveillance-engine'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Notification dispatch (in-app) — Story 50.3 AC #5
// Uses a simple global event emitter pattern so the UI layer can subscribe
// without introducing a hard React import into this module.
// ---------------------------------------------------------------------------

type SurveillanceAlertListener = (alert: SurveillanceAlert) => void
const alertListeners: SurveillanceAlertListener[] = []

/** Subscribe to new surveillance alert events (in-app notification). */
export function onSurveillanceAlert(listener: SurveillanceAlertListener): () => void {
  alertListeners.push(listener)
  return () => {
    const idx = alertListeners.indexOf(listener)
    if (idx !== -1) alertListeners.splice(idx, 1)
  }
}

function emitSurveillanceAlert(alert: SurveillanceAlert): void {
  for (const listener of alertListeners) {
    try { listener(alert) } catch { /* listener errors must not break scheduler */ }
  }
}

// ---------------------------------------------------------------------------
// Facility info helper
// ---------------------------------------------------------------------------

/** Get facility metadata from the local lab_locations table (main lab). */
async function getFacilityInfo(): Promise<{
  labFacilityId: string
  labFacilityName: string
  labProvince: string
  labDistrict: string
}> {
  try {
    const db = getDb()
    const locations = await db.lab_locations.toArray()
    const main = locations.find((l) => l.type === 'main' && l.status === 'active') ?? locations[0]
    if (main) {
      return {
        labFacilityId: main.id,
        labFacilityName: main.name,
        labProvince: (main.settings?.province as string) ?? 'unknown',
        labDistrict: (main.settings?.district as string) ?? 'unknown',
      }
    }
  } catch {
    // Non-fatal — fall back to session info
  }

  const session = useAuthSessionStore.getState().session
  return {
    labFacilityId: session?.userId ?? 'unknown',
    labFacilityName: 'Lab Facility',
    labProvince: 'unknown',
    labDistrict: 'unknown',
  }
}

// ---------------------------------------------------------------------------
// Alert message generation — Task 7.3
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable alert message.
 * Uses English text here; i18n-aware messages are applied in the UI layer.
 * PHI: NEVER include patient names, IDs, or individual test results.
 */
export function buildAlertMessage(alert: Omit<SurveillanceAlert, 'id' | 'message' | 'createdAt' | 'transmissionStatus' | 'transmittedAt' | 'transmissionAttempts' | 'syncStatus'>): string {
  if (alert.alertType === 'spike') {
    const rate = (alert.currentRate ?? 0).toFixed(1)
    const baseline = (alert.baselineRate ?? 0).toFixed(1)
    const ratio = isFinite(alert.spikeRatio ?? 0)
      ? `${(alert.spikeRatio ?? 0).toFixed(1)}x`
      : 'above baseline'
    const count = alert.currentPeriodPositiveCount ?? 0
    const total = alert.currentPeriodTestCount ?? 0
    return `${alert.diseaseLabel} positivity rate at ${rate}% (baseline: ${baseline}%) — ${ratio} above 4-week average. ${count} positive cases out of ${total} tests in the past 7 days.`
  }

  // Cluster
  const count = alert.clusterCaseCount ?? 0
  const hours = 48 // default window
  return `${alert.diseaseLabel} cluster detected: ${count} confirmed cases within the last ${hours} hours.`
}

// ---------------------------------------------------------------------------
// Alert generation — Task 6.3
// ---------------------------------------------------------------------------

/** Create and persist a surveillance alert, enqueue for Hub, emit in-app notification. */
async function generateAlert(
  alertData: Omit<SurveillanceAlert, 'id' | 'message' | 'createdAt' | 'transmissionStatus' | 'transmittedAt' | 'transmissionAttempts' | 'syncStatus'>,
): Promise<SurveillanceAlert> {
  const message = buildAlertMessage(alertData)
  const now = new Date().toISOString()

  const alert: SurveillanceAlert = {
    ...alertData,
    id: uuidv4(),
    message,
    createdAt: now,
    transmissionStatus: 'pending',
    transmissionAttempts: 0,
    syncStatus: 'pending',
  }

  await saveSurveillanceAlert(alert)

  // Enqueue for Hub transmission — high priority (between Tier 1 and Tier 2)
  await enqueueSyncEvent({
    resourceType: 'SurveillanceAlert',
    resourceId: alert.id,
    status: 'pending',
    payload: alert,
    createdAt: now,
    lastAttemptAt: null,
    retryCount: 0,
  })

  // Emit in-app notification
  emitSurveillanceAlert(alert)

  // Audit: SURVEILLANCE_ALERT_GENERATED (no PHI — alertId and diseaseCode only)
  void import('./audit-client').then(({ reportSurveillanceAuditEvent }) => {
    reportSurveillanceAuditEvent({
      action: 'SURVEILLANCE_ALERT_GENERATED',
      alertId: alert.id,
      diseaseCode: alert.diseaseCode,
      alertType: alert.alertType,
      severity: alert.severity,
    })
  })

  return alert
}

// ---------------------------------------------------------------------------
// Main surveillance check — Task 6.2
// ---------------------------------------------------------------------------

/**
 * Run a full surveillance check for all active reportable diseases.
 * For each disease: spike detection + cluster detection.
 * Called daily (spike) and after result authorization (cluster).
 *
 * @returns { alertsGenerated, diseasesChecked } — for audit logging
 */
export async function runSurveillanceCheck(mode: 'spike' | 'cluster' | 'both' = 'both'): Promise<{
  alertsGenerated: number
  diseasesChecked: number
}> {
  const diseases = await getActiveReportableDiseases()
  if (diseases.length === 0) return { alertsGenerated: 0, diseasesChecked: 0 }

  const facilityInfo = await getFacilityInfo()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  let alertsGenerated = 0

  for (const disease of diseases) {
    // --- Spike detection (daily) ---
    if (mode === 'spike' || mode === 'both') {
      try {
        const spike = await detectPositivitySpike(disease, today)
        if (spike.detected && spike.severity) {
          await generateAlert({
            alertType: 'spike',
            severity: spike.severity,
            diseaseCode: disease.diseaseCode,
            diseaseLabel: disease.diseaseLabel,
            ...facilityInfo,
            currentRate: spike.currentRate,
            baselineRate: spike.baselineRate,
            spikeRatio: isFinite(spike.ratio) ? spike.ratio : 999,
            currentPeriodTestCount: spike.testCount,
            currentPeriodPositiveCount: spike.positiveCount,
            periodStart: spike.periodStart,
            periodEnd: spike.periodEnd,
          })
          alertsGenerated++
        }
      } catch {
        // Individual disease check failure must not block others
      }
    }

    // --- Cluster detection (real-time) ---
    if (mode === 'cluster' || mode === 'both') {
      try {
        const windowHours = disease.clusterWindowHours
        const sinceISO = new Date(
          Date.now() - windowHours * 60 * 60 * 1000,
        ).toISOString()
        const existingAlerts = await getRecentClusterAlerts(disease.diseaseCode, sinceISO)

        const cluster = await detectDiseaseCluster(disease, existingAlerts)
        if (cluster.detected) {
          await generateAlert({
            alertType: 'cluster',
            severity: 'critical',
            diseaseCode: disease.diseaseCode,
            diseaseLabel: disease.diseaseLabel,
            ...facilityInfo,
            clusterCaseCount: cluster.caseCount,
            clusterWindowStart: cluster.windowStart,
            clusterWindowEnd: cluster.windowEnd,
          })
          alertsGenerated++
        }
      } catch {
        // Individual disease check failure must not block others
      }
    }
  }

  return { alertsGenerated, diseasesChecked: diseases.length }
}

// ---------------------------------------------------------------------------
// Scheduler lifecycle — Task 6.4–6.6
// ---------------------------------------------------------------------------

const CLUSTER_CHECK_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes (lightweight polling)
const SPIKE_CHECK_INTERVAL_MS = 60 * 60 * 1000    // 1 hour (checks if daily run needed)

let clusterIntervalHandle: ReturnType<typeof setInterval> | null = null
let spikeIntervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Check if the daily spike check is due.
 * Due if: never run, or last run was on a previous calendar day, AND current
 * local hour >= configured daily check hour.
 */
async function isDailySpikeCheckDue(): Promise<boolean> {
  const config = await getSurveillanceSchedulerConfig()
  if (!config.isEnabled) return false

  const now = new Date()
  const localHour = now.getHours()
  if (localHour < config.dailyCheckHour) return false

  if (!config.lastSpikeCheckAt) return true

  const lastRun = new Date(config.lastSpikeCheckAt)
  const lastRunDate = lastRun.toISOString().slice(0, 10)
  const todayDate = now.toISOString().slice(0, 10)

  return lastRunDate < todayDate
}

async function runDailySpikeCheck(): Promise<void> {
  if (!(await isDailySpikeCheckDue())) return

  const { alertsGenerated, diseasesChecked } = await runSurveillanceCheck('spike')

  // Update last run timestamp
  const config = await getSurveillanceSchedulerConfig()
  await putSurveillanceSchedulerConfig({
    ...config,
    lastSpikeCheckAt: new Date().toISOString(),
  })

  // Audit: SURVEILLANCE_CHECK_COMPLETED
  void import('./audit-client').then(({ reportSurveillanceAuditEvent }) => {
    reportSurveillanceAuditEvent({
      action: 'SURVEILLANCE_CHECK_COMPLETED',
      diseasesChecked,
      alertsGenerated,
    })
  })
}

async function runClusterCheck(): Promise<void> {
  const config = await getSurveillanceSchedulerConfig()
  if (!config.isEnabled) return

  await runSurveillanceCheck('cluster')

  await putSurveillanceSchedulerConfig({
    ...config,
    lastClusterCheckAt: new Date().toISOString(),
  })
}

/** Start the surveillance scheduler (call on app init, client-side only). */
export function startSurveillanceScheduler(): void {
  if (typeof window === 'undefined') return

  stopSurveillanceScheduler() // Clear any existing intervals

  // Daily spike check — checks every hour whether the daily window is due
  spikeIntervalHandle = setInterval(() => {
    void runDailySpikeCheck()
  }, SPIKE_CHECK_INTERVAL_MS)

  // Cluster check — runs every 5 minutes for real-time detection
  clusterIntervalHandle = setInterval(() => {
    void runClusterCheck()
  }, CLUSTER_CHECK_INTERVAL_MS)

  // Run immediately on start
  void runDailySpikeCheck()
  void runClusterCheck()
}

/** Stop the surveillance scheduler (call on cleanup). */
export function stopSurveillanceScheduler(): void {
  if (clusterIntervalHandle !== null) {
    clearInterval(clusterIntervalHandle)
    clusterIntervalHandle = null
  }
  if (spikeIntervalHandle !== null) {
    clearInterval(spikeIntervalHandle)
    spikeIntervalHandle = null
  }
}

/**
 * Trigger a real-time cluster check after result authorization.
 * Called from the result authorization flow (Story 42.5 integration point).
 */
export function triggerClusterCheckAfterAuthorization(): void {
  if (typeof window === 'undefined') return
  void runSurveillanceCheck('cluster')
}
