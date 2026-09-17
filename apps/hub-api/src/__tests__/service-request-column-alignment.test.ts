import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { flattenForDb } from '@/lib/resource-mappers'

/**
 * Guard test for the lab-ordering pipeline (Gap #1): the columns
 * flattenServiceRequest emits must (a) all exist on service_requests, (b) route
 * clinical PHI to the uniquely-named encrypted columns (never the colliding
 * generic names), and (c) populate everything lab.pullOrders reads. Catches
 * schema/mapper/reader drift without a live DB.
 */

// Actual service_requests columns after migration 056 (reason_code→order_reason_code,
// note→order_note). Keep in sync with the migration + schema.
const SERVICE_REQUESTS_COLUMNS = new Set([
  'id', 'resource_type', 'status', 'intent', 'priority',
  'code_system', 'code_code', 'code_display', 'order_detail',
  'patient_id', 'encounter_id', 'requester_id', 'authored_on',
  'order_reason_code', 'order_note', 'supporting_info',
  'hlc_timestamp', 'is_offline_created', 'received_at',
  'received_by_lab_id', 'received_by_tech_id', 'special_instructions',
  'meta_last_updated', 'meta_version_id', 'created_at',
])

// Columns lab.pullOrders selects (data-minimized projection).
const PULL_ORDERS_COLUMNS = [
  'status', 'priority', 'code_code', 'code_display',
  'patient_id', 'requester_id', 'authored_on', 'special_instructions', 'meta_last_updated',
]

function toSnake(k: string): string {
  return k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

const SAMPLE = {
  id: 'e1e1e1e1-0000-0000-0000-000000000001',
  resourceType: 'ServiceRequest',
  status: 'active',
  intent: 'order',
  priority: 'routine',
  code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }], text: 'CBC' },
  orderDetail: [{ coding: [{ code: 'fasting' }] }],
  subject: { reference: 'Patient/p1' },
  encounter: { reference: 'Encounter/e1' },
  requester: { reference: 'Practitioner/d1' },
  authoredOn: '2026-05-10T10:00:00Z',
  reasonCode: [{ text: 'anemia' }],
  note: [{ text: 'fasting' }],
  _ultranos: { isOfflineCreated: true, specialInstructions: 'cold-chain', createdAt: '2026-05-10T10:00:00Z' },
  meta: { lastUpdated: '2026-05-10T10:00:00Z', versionId: '1' },
}

describe('flattenServiceRequest → service_requests column alignment', () => {
  it('emits only real service_requests columns', () => {
    const flat = flattenForDb('ServiceRequest', SAMPLE as never)
    const unknownCols = Object.keys(flat).map(toSnake).filter((c) => !SERVICE_REQUESTS_COLUMNS.has(c))
    expect(unknownCols).toEqual([])
  })

  it('routes clinical PHI to the uniquely-named encrypted columns, never the colliding generic names', () => {
    const flat = flattenForDb('ServiceRequest', SAMPLE as never) as Record<string, unknown>
    expect(flat.orderReasonCode).toEqual([{ text: 'anemia' }]) // → order_reason_code (encrypted)
    expect(flat.orderNote).toEqual([{ text: 'fasting' }])       // → order_note (encrypted)
    // These would collide with encounters.reason_code / customer_ledger_entries.note.
    expect(flat.reasonCode).toBeUndefined()
    expect(flat.note).toBeUndefined()
  })

  it('populates every column lab.pullOrders reads', () => {
    const flat = flattenForDb('ServiceRequest', SAMPLE as never)
    const emitted = new Set(Object.keys(flat).map(toSnake))
    // authored_on/meta_last_updated etc. must be present so the lab pull returns them.
    const missing = PULL_ORDERS_COLUMNS.filter((c) => !emitted.has(c))
    expect(missing).toEqual([])
    const f = flat as Record<string, unknown>
    expect(f.codeCode).toBe('58410-2')
    expect(f.patientId).toBe('p1')
    expect(f.specialInstructions).toBe('cold-chain')
  })
})

/**
 * Reader-drift guard for the OTHER half of lab.pullOrders: the embedded joins to
 * patients and practitioners. A unit test with a mocked Supabase can't catch an
 * embed that selects a non-existent column (the mock returns whatever fields it's
 * given), so this parses lab.ts and asserts every embedded column is a REAL column
 * on the joined table. Regression guard for the "ordered test not showing in
 * lab-lite" bug: patients uses Afghan naming (`name_given`), NOT `given_name` —
 * the wrong name made PostgREST error and pullOrders returned nothing.
 */
// Identity/demographic columns that lab.ts embeds may legitimately select.
const PATIENTS_COLUMNS = new Set([
  'id', 'name_given', 'name_father', 'name_grandfather', 'name_family',
  'birth_date', 'birth_year', 'gender',
  // Real column (text) — the patient-photo feature signs this into a short-lived
  // URL for lab identity verification; never the raw key/UUID (Rule #7).
  'photo_url',
])
const PRACTITIONERS_COLUMNS = new Set(['id', 'given_name', 'family_name'])

function embeddedColumns(src: string, resource: string): string[] {
  const re = new RegExp(resource + '![^(]*\\(([^)]*)\\)', 'g')
  const cols: string[] = []
  for (const m of src.matchAll(re)) {
    cols.push(...m[1].split(',').map((c) => c.trim()).filter(Boolean))
  }
  return cols
}

describe('lab.ts embedded-join columns exist on the joined tables', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '../trpc/routers/lab.ts'), 'utf8')

  it('every patients embed selects only real patients columns (name_given, not given_name)', () => {
    const cols = embeddedColumns(src, 'patients')
    expect(cols.length).toBeGreaterThan(0)
    expect(cols.filter((c) => !PATIENTS_COLUMNS.has(c))).toEqual([])
  })

  it('every practitioners embed selects only real practitioners columns', () => {
    const cols = embeddedColumns(src, 'practitioners')
    expect(cols.length).toBeGreaterThan(0)
    expect(cols.filter((c) => !PRACTITIONERS_COLUMNS.has(c))).toEqual([])
  })
})
