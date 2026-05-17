import { db } from '@/lib/db'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import type { SyncQueueEntry } from '@/lib/db'

export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface HistoryFilters {
  dateFrom?: string // ISO date string (YYYY-MM-DD)
  dateTo?: string   // ISO date string (YYYY-MM-DD)
  medicationName?: string
  syncStatus?: SyncStatus
}

export interface HistoryItem {
  id: string
  patientFirstName: string
  medicationNames: string[]
  whenHandedOver: string
  pharmacistDisplay: string
  syncStatus: SyncStatus
}

export interface HistoryPage {
  items: HistoryItem[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ShiftSummaryStats {
  totalPrescriptions: number
  totalMedicationItems: number
  syncSuccessRate: number
  unresolvedFailures: HistoryItem[]
}

const PAGE_SIZE = 20

function extractFirstName(display?: string): string {
  if (!display) return 'Unknown'
  return display.split(' ')[0] ?? 'Unknown'
}

function extractPharmacistDisplay(dispense: LocalMedicationDispense): string {
  const performer = dispense.performer?.[0]
  if (!performer) return 'Unknown'
  const ref = performer.actor.reference ?? ''
  // Display is not available in the FHIR type — use reference as fallback
  return (performer.actor as { reference: string; display?: string }).display ?? ref
}

function extractMedicationNames(dispense: LocalMedicationDispense): string[] {
  const codings = dispense.medicationCodeableConcept?.coding ?? []
  if (codings.length > 0) {
    return codings.map((c) => c.display ?? c.code ?? 'Unknown')
  }
  const text = dispense.medicationCodeableConcept?.text
  return text ? [text] : ['Unknown']
}

function deriveSyncStatus(dispenseId: string, syncMap: Map<string, SyncQueueEntry>): SyncStatus {
  const entry = syncMap.get(dispenseId)
  if (!entry) return 'synced'
  if (entry.status === 'failed') return 'failed'
  if (entry.status === 'synced') return 'synced'
  return 'pending' // covers 'pending' and 'in-flight'
}

function toHistoryItem(
  dispense: LocalMedicationDispense,
  syncMap: Map<string, SyncQueueEntry>,
): HistoryItem {
  return {
    id: dispense.id,
    patientFirstName: extractFirstName(
      (dispense.subject as { reference: string; display?: string }).display,
    ),
    medicationNames: extractMedicationNames(dispense),
    whenHandedOver: dispense.whenHandedOver ?? dispense.meta?.lastUpdated ?? '',
    pharmacistDisplay: extractPharmacistDisplay(dispense),
    syncStatus: deriveSyncStatus(dispense.id, syncMap),
  }
}

async function buildSyncMap(): Promise<Map<string, SyncQueueEntry>> {
  const entries = await db.syncQueue.toArray()
  const map = new Map<string, SyncQueueEntry>()
  for (const e of entries) {
    map.set(e.resourceId, e)
  }
  return map
}

function matchesFilters(item: HistoryItem, filters: HistoryFilters): boolean {
  if (filters.medicationName) {
    const search = filters.medicationName.toLowerCase()
    const match = item.medicationNames.some((name) =>
      name.toLowerCase().includes(search),
    )
    if (!match) return false
  }

  if (filters.syncStatus && item.syncStatus !== filters.syncStatus) {
    return false
  }

  return true
}

/**
 * Query dispensing history with filters and pagination.
 * Date range filtering uses indexed `meta.lastUpdated`.
 * Medication name search uses post-decryption filter() on decrypted records.
 * Sync status requires cross-referencing syncQueue table.
 */
export async function getHistoryPage(
  filters: HistoryFilters = {},
  page: number = 1,
): Promise<HistoryPage> {
  const [dispenses, syncMap] = await Promise.all([
    fetchDispensesByDateRange(filters.dateFrom, filters.dateTo),
    buildSyncMap(),
  ])

  // Convert to history items and apply post-decryption filters
  const allItems = dispenses
    .map((d) => toHistoryItem(d, syncMap))
    .filter((item) => matchesFilters(item, filters))

  // Sort by whenHandedOver descending (most recent first)
  allItems.sort((a, b) => new Date(b.whenHandedOver).getTime() - new Date(a.whenHandedOver).getTime())

  const totalCount = allItems.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.max(1, Math.min(page, totalPages))
  const offset = (safePage - 1) * PAGE_SIZE
  const items = allItems.slice(offset, offset + PAGE_SIZE)

  return { items, totalCount, page: safePage, pageSize: PAGE_SIZE, totalPages }
}

async function fetchDispensesByDateRange(
  dateFrom?: string,
  dateTo?: string,
): Promise<LocalMedicationDispense[]> {
  if (dateFrom && dateTo) {
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    return db.dispenses
      .where('meta.lastUpdated')
      .between(from.toISOString(), to.toISOString(), true, true)
      .toArray()
  }

  if (dateFrom) {
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    return db.dispenses
      .where('meta.lastUpdated')
      .aboveOrEqual(from.toISOString())
      .toArray()
  }

  if (dateTo) {
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    return db.dispenses
      .where('meta.lastUpdated')
      .belowOrEqual(to.toISOString())
      .toArray()
  }

  // No date filter — default to last 30 days to avoid loading entire table
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  defaultFrom.setHours(0, 0, 0, 0)
  return db.dispenses
    .where('meta.lastUpdated')
    .aboveOrEqual(defaultFrom.toISOString())
    .toArray()
}

/**
 * Calculate shift summary stats for the current calendar day (midnight to now).
 */
export async function getShiftSummary(): Promise<ShiftSummaryStats> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [dispenses, syncMap] = await Promise.all([
    db.dispenses
      .where('meta.lastUpdated')
      .aboveOrEqual(todayStart.toISOString())
      .toArray(),
    buildSyncMap(),
  ])

  const items = dispenses.map((d) => toHistoryItem(d, syncMap))
  const totalPrescriptions = items.length
  const totalMedicationItems = dispenses.reduce(
    (sum, d) => sum + (d.medicationCodeableConcept?.coding?.length ?? 1),
    0,
  )

  const syncedCount = items.filter((i) => i.syncStatus === 'synced').length
  const syncSuccessRate =
    totalPrescriptions > 0
      ? Math.round((syncedCount / totalPrescriptions) * 100)
      : 100

  const unresolvedFailures = items.filter((i) => i.syncStatus === 'failed')

  return {
    totalPrescriptions,
    totalMedicationItems,
    syncSuccessRate,
    unresolvedFailures,
  }
}
