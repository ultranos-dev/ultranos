import Dexie, { type EntityTable } from 'dexie'
import type { LocalMedicationDispense } from './medication-dispense'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from './dexie-encryption-middleware'
import type { CatalogItem, StockBatch, StockMovement, GoodsReceipt, PharmacyInventorySettings } from './inventory/types'
import { INVENTORY_STORES } from './inventory-db'
import type { Invoice, Payment, LedgerEntry, PatientAccount, CashDrawer } from './pos/types'
import { POS_STORES } from './pos-db'
import type { Supplier, PurchaseOrder, StockCount } from './procurement/types'
import type { StockTransfer } from './transfers/types'
import type { DataUsageCategory } from '@ultranos/sync-engine'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
export type { DataUsageCategory }  // re-export for consumers

export interface DispenseAuditEntry {
  id: string
  dispenseId: string
  patientRef: string
  medicationCode: string
  medicationDisplay: string
  pharmacistRef: string
  action: 'created' | 'cancelled'
  hlcTimestamp: string
  createdAt: string
}

/**
 * Structured audit event queued for sync to the Hub API.
 * Contains only opaque IDs — no PHI. The Hub API feeds these
 * through the real AuditLogger with SHA-256 hash chaining.
 */
export interface PendingAuditEvent {
  id: string
  timestamp: string
  actorId?: string
  actorRole: string
  action: string
  resourceType: string
  resourceId?: string
  patientId?: string
  sessionId?: string
  deviceId?: string
  sourceIpHash?: string
  outcome: string
  denialReason?: string
  metadata?: Record<string, unknown>
  _syncStatus: 'pending' | 'synced' | 'failed'
}

export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: string
  payload: string
  status: 'pending' | 'in-flight' | 'failed' | 'synced'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
}

export interface PractitionerKeyEntry {
  publicKey: string          // base64-encoded Ed25519 public key (primary key)
  practitionerId: string
  practitionerName: string
  cachedAt: string           // ISO 8601 timestamp
}

/**
 * Local Key Revocation List (KRL) entry.
 * Story 7.4 AC 3: Synchronized from Hub as high-priority sync item.
 * Contains only the revoked public key and revocation time — no PHI.
 */
export interface RevokedKeyEntry {
  publicKey: string          // base64-encoded Ed25519 public key (primary key)
  revokedAt: string          // ISO 8601 timestamp
}

export interface LocalPatient {
  id: string
  nameGiven: string
  nameFather?: string
  gender: 'male' | 'female' | 'other' | 'unknown'
  birthYear?: number
  birthDate?: string
  phone?: string
  preferredLanguage?: string
  allergies?: string[]
  createdAt: string
  source: 'registered' | 'qr-verified' | 'hub-synced'
}

export interface CatalogSyncMetaEntry {
  key: string
  value: string
}

// Data Budget types — Story 48.x / Data Connectivity
// ---------------------------------------------------------------------------
export interface DataBudgetConfig {
  id: 'config'
  planSizeMB: number
  billingCycleDay: number   // 1-28: day of month cycle resets
  lowDataMode: boolean
  currentCycleStart: string // ISO 8601 date of current cycle start
}

export interface DataUsageRecord {
  date: string
  category: DataUsageCategory
  bytesOut: number
  bytesIn: number
  requestCount: number
}

class PharmacyLiteDatabase extends Dexie {
  practitionerKeys!: EntityTable<PractitionerKeyEntry, 'publicKey'>
  revokedKeys!: EntityTable<RevokedKeyEntry, 'publicKey'>
  dispenses!: EntityTable<LocalMedicationDispense, 'id'>
  dispenseAuditLog!: EntityTable<DispenseAuditEntry, 'id'>
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>
  pendingAuditEvents!: EntityTable<PendingAuditEvent, 'id'>
  clientAuditLog!: EntityTable<ClientAuditEvent, 'id'>
  patients!: EntityTable<LocalPatient, 'id'>
  catalogItems!: EntityTable<CatalogItem, 'id'>
  stockBatches!: EntityTable<StockBatch, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  goodsReceipts!: EntityTable<GoodsReceipt, 'id'>
  pharmacySettings!: EntityTable<PharmacyInventorySettings, 'locationId'>
  invoices!: EntityTable<Invoice, 'id'>
  payments!: EntityTable<Payment, 'id'>
  ledgerEntries!: EntityTable<LedgerEntry, 'id'>
  patientAccounts!: EntityTable<PatientAccount, 'id'>
  cashDrawers!: EntityTable<CashDrawer, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  purchaseOrders!: EntityTable<PurchaseOrder, 'id'>
  stockCounts!: EntityTable<StockCount, 'id'>
  stockTransfers!: EntityTable<StockTransfer, 'id'>
  dataBudgetConfig!: Dexie.Table<DataBudgetConfig, string>
  dataUsage!: Dexie.Table<DataUsageRecord & { id?: number }, number>
  drugCatalogMirror!: EntityTable<DrugEntry, 'atcCode'>
  drugBrandsMirror!: EntityTable<DrugBrand, 'id'>
  drugBrandPresentationsMirror!: EntityTable<DrugBrandPresentation, 'id'>
  drugCatalogSyncMeta!: EntityTable<CatalogSyncMetaEntry, 'key'>

  constructor() {
    super('pharmacy-lite')

    this.version(1).stores({
      practitionerKeys: 'publicKey, practitionerId',
      dispenses: 'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      dispenseAuditLog: 'id, dispenseId, patientRef, pharmacistRef, action, createdAt',
      syncQueue: 'id, resourceType, resourceId, status, createdAt',
    })

    // v2: Add pendingAuditEvents table for structured audit events
    // queued for sync to Hub API. Contains only opaque IDs (no PHI),
    // so no encryption is needed.
    this.version(2).stores({
      pendingAuditEvents: 'id, _syncStatus, timestamp',
    })

    // v3: Add revokedKeys table for local Key Revocation List (KRL).
    // Story 7.4 AC 3: KRL synchronized as high-priority sync item.
    // Non-PHI — contains only revoked public keys and timestamps.
    this.version(3).stores({
      revokedKeys: 'publicKey',
    })

    // v4: Client-side audit ledger (Story 8.1)
    // Not encrypted — contains only opaque IDs, no PHI.
    this.version(4).stores({
      clientAuditLog: 'id, status, queuedAt, [status+queuedAt]',
    })

    // v5: Local patient registry for pharmacy-managed patients
    this.version(5).stores({
      patients: 'id, nameGiven, phone, createdAt',
    })

    // v6: Inventory management — catalog, stock batches, movements, goods receipts, settings
    this.version(6).stores(INVENTORY_STORES)

    // v7: Point of Sale — invoices, payments, ledger entries, patient accounts, cash drawers
    this.version(7).stores(POS_STORES)

    // v8: Add lastSyncedAt index to catalogItems (fixes orderBy query in catalog-sync)
    this.version(8).stores({
      catalogItems: 'id, barcode, name, category, controlledSchedule, isActive, lastSyncedAt',
    })

    // v9: Procurement — suppliers, purchase orders, stock counts
    this.version(9).stores({
      suppliers: 'id, name, isActive',
      purchaseOrders: 'id, supplierId, status, createdAt',
      stockCounts: 'id, type, status, startedAt',
    })

    // v10: Stock transfers — cross-location inventory movements
    this.version(10).stores({
      stockTransfers: 'id, fromLocationId, toLocationId, status, requestedAt',
    })

    // v11: Data Budget tables — track network usage per billing cycle (Story 48.x)
    // No PHI — contains only byte counts, dates, and category labels.
    this.version(11).stores({
      dataBudgetConfig: '&id',
      dataUsage: '++id, date, category, [date+category]',
    })

    // v12: Story 28.6 — Search Encryption Strategy
    // Remove nameGiven and phone from patients indexes — both are PHI.
    // Patient search uses in-memory decrypt-and-filter via the middleware's filter() proxy.
    this.version(12).stores({
      patients: 'id, createdAt',
    }).upgrade(async (tx) => {
      // Remove cleartext PHI fields from existing patient records in IndexedDB.
      // nameGiven and phone are already encrypted inside the _enc blob — this upgrade
      // only removes the redundant cleartext copies from the stored objects.
      await tx.table('patients').toCollection().modify((record: Record<string, unknown>) => {
        delete record['nameGiven']
        delete record['phone']
      })
    })

    // v13: Phase 2 — enriched drug-catalog mirror + brands (non-PHI reference data).
    // Plaintext (not in PHI_TABLE_CONFIGS); preserved across logout.
    this.version(13).stores({
      drugCatalogMirror: '&atcCode, innName, *brandNames',
      drugBrandsMirror: '&id, genericAtcCode',
      drugBrandPresentationsMirror: '&id, brandId',
      drugCatalogSyncMeta: '&key',
    })
  }
}

/**
 * PHI tables that require field-level encryption via AES-256-GCM.
 * Indexed fields remain in cleartext for Dexie queries; all other
 * fields are encrypted into a single `_enc` blob in IndexedDB.
 *
 * Non-PHI tables (practitionerKeys, syncQueue) are NOT encrypted —
 * they contain operational data (opaque IDs, timestamps) rather than
 * clinical content. Audit tables are encrypted because they contain
 * medicationDisplay and patient references (clinical content).
 */
const PHI_TABLE_CONFIGS: EncryptionTableConfig[] = [
  {
    tableName: 'dispenses',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'dispenseAuditLog',
    indexedFields: [
      'id',
      'dispenseId',
      'patientRef',
      'pharmacistRef',
      'action',
      'createdAt',
    ],
  },
  {
    // Story 28.6: nameGiven and phone removed from indexedFields — both are PHI.
    // Search uses the middleware's filter() proxy (in-memory decrypt-and-filter).
    // See adr-028-search-encryption-strategy.
    tableName: 'patients',
    indexedFields: ['id', 'createdAt'],
  },
]

export const db = new PharmacyLiteDatabase()

applyEncryptionMiddleware(db, PHI_TABLE_CONFIGS)

// ---------------------------------------------------------------------------
// Data Budget helpers (v11) — Story 48.x
// No PHI — network usage metrics only.
// ---------------------------------------------------------------------------

/** Parse YYYY-MM-DD string as local midnight (avoids UTC offset issues in MENA timezones). */
function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number)
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!)
}

/** Format a Date as YYYY-MM-DD using local time. */
function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DATA_BUDGET_CONFIG_ID = 'config' as const

const DEFAULT_DATA_BUDGET_CONFIG: DataBudgetConfig = {
  id: DATA_BUDGET_CONFIG_ID,
  planSizeMB: 500,
  billingCycleDay: 1,
  lowDataMode: false,
  currentCycleStart: (() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    return formatLocalDate(d)
  })(),
}

/** Return the current data budget configuration (returns default if none stored). */
export async function getDataBudgetConfig(): Promise<DataBudgetConfig> {
  const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
  return stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
}

/** Update data budget configuration fields (upserts). */
export async function updateDataBudgetConfig(
  updates: Partial<Omit<DataBudgetConfig, 'id'>>,
): Promise<void> {
  const current = await getDataBudgetConfig()
  await db.dataBudgetConfig.put({ ...current, ...updates, id: DATA_BUDGET_CONFIG_ID })
}

/** Record a network usage entry. */
export async function recordDataUsage(record: DataUsageRecord): Promise<void> {
  await db.dataUsage.add(record)
}

/** Return all usage records within a date range (inclusive). */
export async function getUsageByDay(startDate: string, endDate: string): Promise<DataUsageRecord[]> {
  return db.dataUsage
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray()
}

/** Return all usage records for the current billing cycle. */
export async function getUsageForCycle(): Promise<DataUsageRecord[]> {
  const config = await getDataBudgetConfig()
  const today = formatLocalDate(new Date())
  return db.dataUsage
    .where('date')
    .between(config.currentCycleStart, today, true, true)
    .toArray()
}

/**
 * Check if billing cycle has expired and roll it over if so.
 * Returns true if a rollover happened.
 * Uses local-time date parsing to avoid UTC offset issues in MENA timezones.
 */
export async function checkAndRolloverCycle(): Promise<boolean> {
  return db.transaction('rw', db.dataBudgetConfig, async () => {
    const stored = await db.dataBudgetConfig.get(DATA_BUDGET_CONFIG_ID)
    const config = stored ?? { ...DEFAULT_DATA_BUDGET_CONFIG }
    const today = new Date()
    const cycleStart = parseDateLocal(config.currentCycleStart)
    const nextCycleDate = new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth() + 1,
      Math.min(config.billingCycleDay, 28),
    )
    if (today >= nextCycleDate) {
      const newCycleStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        Math.min(config.billingCycleDay, 28),
      )
      if (newCycleStart > today) {
        newCycleStart.setMonth(newCycleStart.getMonth() - 1)
      }
      await db.dataBudgetConfig.put({
        ...config,
        currentCycleStart: formatLocalDate(newCycleStart),
      })
      return true
    }
    return false
  })
}
