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
  status: 'pending' | 'in-flight' | 'failed'
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
    tableName: 'patients',
    indexedFields: ['id', 'nameGiven', 'phone', 'createdAt'],
  },
]

export const db = new PharmacyLiteDatabase()

applyEncryptionMiddleware(db, PHI_TABLE_CONFIGS)
