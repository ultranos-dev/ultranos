import Dexie, { type EntityTable } from 'dexie'
import type { LocalMedicationDispense } from './medication-dispense'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from './dexie-encryption-middleware'
import type { CatalogItem, StockBatch, StockMovement, GoodsReceipt, PharmacyInventorySettings, StockLocation } from './inventory/types'
import { INVENTORY_STORES } from './inventory-db'
import type { Invoice, Payment, LedgerEntry, PatientAccount, CashDrawer, Refund } from './pos/types'
import { POS_STORES } from './pos-db'
import type { Supplier, PurchaseOrder, StockCount, SupplierInvoice, SupplierPayment, SupplierItem } from './procurement/types'
import type { StockTransfer } from './transfers/types'
import type { DataUsageCategory } from '@ultranos/sync-engine'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation, FhirAllergyIntolerance, FhirObservation } from '@ultranos/shared-types'
import type { WholesaleCustomer, SalesOrder, CustomerAccount, CustomerLedgerEntry, ContractPrice } from '@/lib/wholesale/types'
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

/**
 * The mutation kind a queued entry represents — the pharmacy spoke's actual
 * action set. `dispense_sync` is a pharmacy-internal label (normalised to
 * `create` at drain time) that the sync-engine union does not carry; the
 * engine in turn has conflict-resolution actions the pharmacy never enqueues.
 * The two sets legitimately differ, so the dexie-sync-adapter casts `action`
 * at the boundary. This union replaces a loose `string` to give enqueue-time
 * type safety (a typo'd action now fails at compile).
 */
export type SyncQueueAction = 'create' | 'update' | 'delete' | 'dispense_sync'

export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: SyncQueueAction
  payload: string
  status: 'pending' | 'in-flight' | 'failed' | 'synced' | 'awaiting-key'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
  /** Last failure reason persisted by the drain worker (opaque server text —
   *  categorized for display via classifySyncFailure, never rendered raw). */
  failureReason?: string
  /** Set true when a Hub sync conflict for this entry was auto-resolved
   *  (Hub version kept). Observability only — no remote PHI is stored. */
  conflictFlag?: boolean
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

/**
 * Story 57.1: Cached hub allergy fetch for dispense-time safety (C-SYS-3).
 * Keyed by BARE patient ref with a `fetchedAt` staleness marker so a recently
 * fetched record still protects an offline re-dispense. PHI (allergy
 * substances) — encrypted via PHI_TABLE_CONFIGS and cleared on session end.
 */
export interface PatientAllergyCacheEntry {
  patientRef: string
  allergies: string[]
  fetchedAt: string
}

export interface CatalogSyncMetaEntry {
  key: string
  value: string
}

/**
 * Story 57.4 (M-PHARM-2, AC 3): a durable record that a stock deduction FAILED
 * during dispensing (batch missing, insufficient on-hand, or an infrastructure
 * error). Dispensing is a clinical priority and is NOT blocked by inventory
 * problems — instead the failure is captured here so it is never silently
 * swallowed: the pharmacist sees a persistent warning and a reconciliation task
 * on the inventory page, and can manually adjust the ledger.
 *
 * Non-PHI: contains only opaque inventory ids, quantities, and an error category
 * — never a patient name, patient ref, or medication name. Preserved across
 * session end (NOT in PHI_TABLE_CONFIGS) because the ledger drift it records must
 * survive logout until an adjustment resolves it.
 */
export interface StockReconciliationTask {
  id: string
  /** Opaque catalog item id whose deduction failed (may be undefined if the
   *  catalog lookup itself failed). */
  catalogItemId?: string
  /** Opaque FEFO batch id the deduction targeted. */
  stockBatchId?: string
  /** Quantity that should have been deducted but was not. */
  quantity: number
  /** Why the deduction failed — a coarse category, never raw PHI/error text. */
  reason: 'insufficient_stock' | 'batch_not_found' | 'deduction_error'
  /** Opaque dispense reference id (a prescription/dispense id — not patient data). */
  referenceId?: string
  status: 'open' | 'resolved'
  createdAt: string
  hlcTimestamp: string
  resolvedAt?: string
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
  supplierInvoices!: EntityTable<SupplierInvoice, 'id'>
  supplierPayments!: EntityTable<SupplierPayment, 'id'>
  supplierItems!: EntityTable<SupplierItem, 'id'>
  stockCounts!: EntityTable<StockCount, 'id'>
  stockTransfers!: EntityTable<StockTransfer, 'id'>
  dataBudgetConfig!: Dexie.Table<DataBudgetConfig, string>
  dataUsage!: Dexie.Table<DataUsageRecord & { id?: number }, number>
  drugCatalogMirror!: EntityTable<DrugEntry, 'atcCode'>
  drugBrandsMirror!: EntityTable<DrugBrand, 'id'>
  drugBrandPresentationsMirror!: EntityTable<DrugBrandPresentation, 'id'>
  drugCatalogSyncMeta!: EntityTable<CatalogSyncMetaEntry, 'key'>
  wholesaleCustomers!: EntityTable<WholesaleCustomer, 'id'>
  salesOrders!: EntityTable<SalesOrder, 'id'>
  customerAccounts!: EntityTable<CustomerAccount, 'id'>
  customerLedgerEntries!: EntityTable<CustomerLedgerEntry, 'id'>
  contractPrices!: EntityTable<ContractPrice, 'id'>
  wholesalePullMeta!: EntityTable<{ key: string; lastPulledHlc: string }, 'key'>
  stockLocations!: EntityTable<StockLocation, 'id'>
  patientAllergyCache!: EntityTable<PatientAllergyCacheEntry, 'patientRef'>
  stockReconciliationTasks!: EntityTable<StockReconciliationTask, 'id'>
  refunds!: EntityTable<Refund, 'id'>
  // Patient clinical records captured by the shared registration/edit form (parity
  // with OPD-Lite: allergies are Tier-1 append-only, vitals are Observations). Both
  // are PHI → encrypted (see PHI_TABLE_CONFIGS below).
  allergyIntolerances!: EntityTable<FhirAllergyIntolerance, 'id'>
  observations!: EntityTable<FhirObservation, 'id'>

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

    // v14: Wholesale / B2B sales — customers, orders, AR accounts, ledger entries.
    // Non-PHI operational data; not added to PHI_TABLE_CONFIGS.
    this.version(14).stores({
      wholesaleCustomers: 'id, name, isActive',
      salesOrders: 'id, customerId, status, createdAt, orderNumber',
      customerAccounts: 'id, customerId',
      customerLedgerEntries: 'id, customerId, salesOrderId, timestamp',
    })

    // v15: Wholesale pull watermark — stores the last HLC timestamp of a successful pull
    // from the wholesale server. Non-PHI operational metadata; not added to PHI_TABLE_CONFIGS.
    this.version(15).stores({
      wholesalePullMeta: 'key',
    })

    // v16: Contract pricing — per-customer contract prices for catalog items.
    // Non-PHI operational data; not added to PHI_TABLE_CONFIGS.
    this.version(16).stores({
      contractPrices: 'id, customerId, [customerId+catalogItemId]',
    })

    // v17: Procurement Phase 1 — index goodsReceipts by purchaseOrderId so a PO's
    // receipt history is queryable. Non-PHI operational data.
    this.version(17).stores({
      goodsReceipts: 'id, receivedAt, supplierId, purchaseOrderId',
    })

    // v18: Procurement Phase 2b-i — supplier invoices for 3-way match.
    // Non-PHI operational data; not encrypted.
    this.version(18).stores({
      supplierInvoices: 'id, purchaseOrderId, supplierId, status, invoiceNumber, [supplierId+invoiceNumber]',
    })

    // v19: Procurement Phase 2b-ii — supplier payments + AP settlement.
    // Non-PHI operational data (money + ids only); not encrypted.
    this.version(19)
      .stores({
        supplierInvoices:
          'id, purchaseOrderId, supplierId, status, invoiceNumber, settlementStatus, [supplierId+invoiceNumber], [supplierId+status]',
        supplierPayments: 'id, supplierId, status, paidAt, [supplierId+status]',
      })
      .upgrade(async (tx) => {
        await tx.table('supplierInvoices').toCollection().modify((inv: Record<string, unknown>) => {
          if (inv['amountPaid'] === undefined) inv['amountPaid'] = 0
          if (inv['settlementStatus'] === undefined) inv['settlementStatus'] = 'unpaid'
          if (inv['dueDate'] === undefined) inv['dueDate'] = inv['createdAt']
        })
      })

    // v20: Procurement Phase 4a — supplier↔item catalog (junction).
    // Non-PHI operational data; not encrypted.
    this.version(20).stores({
      supplierItems: 'id, supplierId, catalogItemId, [supplierId+catalogItemId], [catalogItemId+isPreferred]',
    })

    // v21: Multi-location SP1b — read-only cache of facility sub-locations.
    // Non-PHI operational data; not encrypted.
    this.version(21).stores({
      stockLocations: 'id, isPrimary, isActive',
    })

    // v22: Story 57.1 — dispense-time allergy cache (C-SYS-3 remediation).
    // PHI (allergy substances): encrypted via PHI_TABLE_CONFIGS below and
    // cleared on session end (phi-cleanup). Keyed by bare patient ref with a
    // fetchedAt staleness marker for offline re-dispense protection.
    this.version(22).stores({
      patientAllergyCache: 'patientRef, fetchedAt',
    })

    // v23: Story 57.4 — stock reconciliation tasks (M-PHARM-2, AC 3).
    // Records a failed stock deduction during dispensing so it is never silently
    // swallowed. Non-PHI (opaque inventory ids + quantities only) — NOT added to
    // PHI_TABLE_CONFIGS and PRESERVED across session end so ledger drift survives
    // logout until resolved by a manual adjustment.
    this.version(23).stores({
      stockReconciliationTasks: 'id, status, catalogItemId, createdAt, [status+createdAt]',
    })

    // v24: Story 62.1 — Pharmacy financial correctness (C-PHARM-2, M-PHARM-5).
    //  1. `refunds` store: refund/void cash-out records (ids + money + operational
    //     reason only). NOT in PHI_TABLE_CONFIGS and PRESERVED across session end,
    //     matching invoices/payments (financial, non-clinical). The sync-queue
    //     entry it enqueues IS encrypted because it carries `patientId`.
    //  2. taxRate convention normalization: POS previously computed tax as a
    //     FRACTION (`subtotal * taxRate`) while procurement/wholesale used PERCENT.
    //     We standardize on PERCENT. To keep HISTORICAL invoices rendering their
    //     originally-computed amounts, every pre-existing invoice is stamped
    //     `taxRateConvention: 'fraction'` (its stored taxAmount is left untouched);
    //     the stored `pharmacySettings.taxRate` is converted from a fraction to a
    //     percent ONCE (×100) and marked `taxRateConvention: 'percent'`. A settings
    //     value already at the percent convention is left as-is (idempotent guard).
    this.version(24)
      .stores({
        refunds: 'id, invoiceId, cashDrawerId, timestamp',
      })
      .upgrade(async (tx) => {
        await tx.table('invoices').toCollection().modify((inv: Record<string, unknown>) => {
          if (inv['taxRateConvention'] === undefined) {
            inv['taxRateConvention'] = 'fraction'
          }
        })
        await tx.table('pharmacySettings').toCollection().modify((s: Record<string, unknown>) => {
          if (s['taxRateConvention'] === 'percent') return
          const rate = typeof s['taxRate'] === 'number' ? (s['taxRate'] as number) : 0
          // A stored fraction (e.g. 0.1 = 10%) becomes a percent (10). A value of
          // 0 is convention-agnostic. Values already ≥ 1 that lack the marker are
          // ambiguous but were almost certainly entered as percents by procurement
          // prefill — do NOT ×100 those (would 100× them); just mark them percent.
          if (rate > 0 && rate < 1) {
            s['taxRate'] = Math.round(rate * 100 * 1e6) / 1e6
          }
          s['taxRateConvention'] = 'percent'
        })
      })

    // v25: Patient clinical records captured by the shared registration/edit form
    // (parity with OPD-Lite — nothing gated). `allergyIntolerances` is Tier-1
    // append-only (Safety Rule #5); `observations` holds vitals as FHIR Observations.
    // Index strings mirror OPD-Lite exactly. Both are PHI (encrypted below).
    this.version(25).stores({
      allergyIntolerances:
        'id, patient.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
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
    // Patient allergies (clinical content) — mirrors OPD-Lite's config exactly.
    tableName: 'allergyIntolerances',
    indexedFields: [
      'id',
      'patient.reference',
      'clinicalStatus.coding[0].code',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    // Vitals as FHIR Observations (clinical content) — mirrors OPD-Lite's config.
    tableName: 'observations',
    indexedFields: [
      'id',
      'encounter.reference',
      'subject.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
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
  {
    // Story 57.1: cached hub allergy fetch — substances are PHI; only the
    // opaque patient ref + staleness marker stay cleartext for queries.
    tableName: 'patientAllergyCache',
    indexedFields: ['patientRef', 'fetchedAt'],
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
