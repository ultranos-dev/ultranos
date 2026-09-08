/**
 * FHIR-to-DB resource mappers.
 *
 * The FHIR R4 resource shapes (nested objects) don't match the flat
 * Supabase column schemas. These mappers flatten each resource type
 * before the row is passed to db.toRow() for snake_case + encryption.
 *
 * Each mapper returns a flat camelCase object whose keys align 1:1
 * with the DB columns (after toSnakeCase converts them).
 */

// ---------------------------------------------------------------------------
// Encounter → encounters table
// ---------------------------------------------------------------------------

interface FhirEncounterPayload {
  id: string
  resourceType?: string
  status: string
  class?: { system?: string; code?: string; display?: string }
  type?: unknown
  subject?: { reference?: string }
  participant?: unknown
  period?: { start?: string; end?: string }
  reasonCode?: unknown
  diagnosis?: unknown
  _ultranos?: {
    clinicId?: string
    soapNoteId?: string
    isOfflineCreated?: boolean
    hlcTimestamp?: string
    createdAt?: string
  }
  meta?: { lastUpdated?: string; versionId?: string }
}

/**
 * Normalize Encounter.participant references to the canonical FHIR
 * "Practitioner/<id>" form. Some spoke versions historically stored a bare UUID
 * in `individual.reference`, which silently breaks participant-scoped queries
 * (encounter.listByPractitioner matches on "Practitioner/<id>"). Normalizing at
 * ingestion makes the Hub authoritative regardless of the spoke's format — a
 * reference without a resource-type prefix (no "/") is assumed to be a Practitioner.
 */
function normalizeParticipantRefs(participant: unknown): unknown {
  if (!Array.isArray(participant)) return participant ?? null
  return participant.map((p) => {
    if (p && typeof p === 'object' && 'individual' in p) {
      const individual = (p as { individual?: { reference?: string } }).individual
      const ref = individual?.reference
      if (typeof ref === 'string' && ref.length > 0 && !ref.includes('/')) {
        return { ...p, individual: { ...individual, reference: `Practitioner/${ref}` } }
      }
    }
    return p
  })
}

function flattenEncounter(payload: FhirEncounterPayload): Record<string, unknown> {
  const subjectRef = payload.subject?.reference ?? ''
  const subjectId = subjectRef.replace(/^Patient\//, '')

  return {
    id: payload.id,
    status: payload.status,
    // class → three flat columns
    classSystem: payload.class?.system ?? 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    classCode: payload.class?.code ?? 'AMB',
    classDisplay: payload.class?.display ?? null,
    // type stays JSONB
    type: payload.type ?? null,
    // subject.reference → subject_id (UUID)
    subjectId,
    // participant stays JSONB — normalized to canonical Practitioner/<id> refs so
    // participant-scoped queries work regardless of the spoke's reference format.
    participant: normalizeParticipantRefs(payload.participant),
    // period → two flat columns
    periodStart: payload.period?.start ?? null,
    periodEnd: payload.period?.end ?? null,
    // reasonCode stays JSONB
    reasonCode: payload.reasonCode ?? null,
    // FHIR Encounter.diagnosis (Condition references) → diagnosis_refs JSONB.
    // Column is NOT named `diagnosis` to avoid the global field-encryption entry
    // of that name, which would encrypt-as-text and corrupt the jsonb write.
    diagnosisRefs: payload.diagnosis ?? null,
    // _ultranos → flat columns
    clinicId: payload._ultranos?.clinicId ?? null,
    soapNoteId: payload._ultranos?.soapNoteId ?? null,
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    // meta → flat columns
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    // _ultranos.createdAt → created_at (Ultranos extension, not in meta)
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// ClinicalImpression (SOAP) → soap_ledger table
// ---------------------------------------------------------------------------

// Field names must match the client ledger entry persisted by the OPD-Lite SOAP
// store (subjective/objective/assessment/plan + assessorRef), NOT the soap_*
// DB column names — otherwise the note text and practitioner persist as NULL.
interface FhirClinicalImpressionPayload {
  id: string
  resourceType?: string
  encounterId?: string
  assessorRef?: string       // `Practitioner/<uuid>`
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
  createdAt?: string
  _ultranos?: { hlcTimestamp?: string; createdAt?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenClinicalImpression(payload: FhirClinicalImpressionPayload): Record<string, unknown> {
  return {
    id: payload.id,
    encounterId: payload.encounterId,
    practitionerId: (payload.assessorRef ?? '').replace(/^Practitioner\//, '') || null,
    soapSubjective: payload.subjective ?? null,
    soapObjective: payload.objective ?? null,
    soapAssessment: payload.assessment ?? null,
    soapPlan: payload.plan ?? null,
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    createdAt: payload.createdAt ?? payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Observation (vitals) → observations table
// ---------------------------------------------------------------------------

interface FhirObservationPayload {
  id: string
  resourceType?: string
  status?: string
  category?: unknown
  code?: unknown
  subject?: { reference?: string }
  encounter?: { reference?: string }
  effectiveDateTime?: string
  performer?: unknown
  valueQuantity?: unknown
  component?: unknown
  _ultranos?: { isOfflineCreated?: boolean; hlcTimestamp?: string; createdAt?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenObservation(payload: FhirObservationPayload): Record<string, unknown> {
  const subjectId = (payload.subject?.reference ?? '').replace(/^Patient\//, '')
  const encounterId = (payload.encounter?.reference ?? '').replace(/^Encounter\//, '') || null
  return {
    id: payload.id,
    status: payload.status ?? 'final',
    // code / category / value_quantity / component stay JSONB (not encrypted)
    category: payload.category ?? null,
    code: payload.code ?? null,
    subjectId,
    encounterId,
    effectiveDateTime: payload.effectiveDateTime ?? null,
    performer: payload.performer ?? null,
    valueQuantity: payload.valueQuantity ?? null,
    component: payload.component ?? null,
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Patient → patients table (mostly flat already)
// ---------------------------------------------------------------------------

function flattenPatient(payload: Record<string, unknown>): Record<string, unknown> {
  // Patient schema is already flat in the DB — strip resourceType and pass through
  const { resourceType: _, ...rest } = payload
  return rest
}

// ---------------------------------------------------------------------------
// AllergyIntolerance → allergy_intolerances table (Tier-1, append-only)
// ---------------------------------------------------------------------------

interface FhirAllergyIntolerancePayload {
  id: string
  resourceType?: string
  clinicalStatus?: { coding?: Array<{ code?: string }> }
  verificationStatus?: { coding?: Array<{ code?: string }> }
  type?: string
  criticality?: string
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string }
  patient?: { reference?: string }
  recorder?: { reference?: string }
  recordedDate?: string
  _ultranos?: { substanceFreeText?: string; createdAt?: string; recordedByRole?: string; isOfflineCreated?: boolean; hlcTimestamp?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenAllergyIntolerance(payload: FhirAllergyIntolerancePayload): Record<string, unknown> {
  const coding = payload.code?.coding?.[0]
  return {
    id: payload.id,
    clinicalStatusCode: payload.clinicalStatus?.coding?.[0]?.code ?? null,
    verificationStatusCode: payload.verificationStatus?.coding?.[0]?.code ?? null,
    type: payload.type ?? null,
    criticality: payload.criticality ?? null,
    substanceText: payload.code?.text ?? coding?.display ?? null,
    substanceCode: coding?.code ?? null,
    substanceSystem: coding?.system ?? null,
    // patient_ref / recorder_ref store the bare UUID so the pull's patient-scope
    // filter (.eq('patient_ref', patientId)) matches.
    patientRef: (payload.patient?.reference ?? '').replace(/^Patient\//, '') || null,
    recorderRef: (payload.recorder?.reference ?? '').replace(/^Practitioner\//, '') || null,
    recordedDate: payload.recordedDate ?? null,
    substanceFreeText: payload._ultranos?.substanceFreeText ?? null,
    metaLastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Condition → conditions table
// ---------------------------------------------------------------------------

interface FhirConditionPayload {
  id: string
  resourceType?: string
  clinicalStatus?: unknown
  category?: unknown
  code?: unknown
  subject?: { reference?: string }
  encounter?: { reference?: string }
  recorder?: { reference?: string }
  recordedDate?: string
  _ultranos?: { isOfflineCreated?: boolean; hlcTimestamp?: string; createdAt?: string; diagnosisRank?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenCondition(payload: FhirConditionPayload): Record<string, unknown> {
  return {
    id: payload.id,
    clinicalStatus: payload.clinicalStatus ?? null,   // jsonb
    category: payload.category ?? null,                // jsonb
    code: payload.code ?? null,                        // jsonb
    subjectId: (payload.subject?.reference ?? '').replace(/^Patient\//, '') || null,
    encounterId: (payload.encounter?.reference ?? '').replace(/^Encounter\//, '') || null,
    recorderId: (payload.recorder?.reference ?? '').replace(/^Practitioner\//, '') || null,
    recordedDate: payload.recordedDate ?? null,
    diagnosisRank: payload._ultranos?.diagnosisRank ?? null,
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// MedicationRequest → medication_requests table
// ---------------------------------------------------------------------------

interface FhirMedicationRequestPayload {
  id: string
  resourceType?: string
  status?: string
  intent?: string
  medicationCodeableConcept?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string }
  subject?: { reference?: string }
  encounter?: { reference?: string }
  requester?: { reference?: string }
  authoredOn?: string
  dosageInstruction?: unknown
  dispenseRequest?: unknown
  _ultranos?: {
    prescriptionStatus?: string
    interactionCheckResult?: string
    interactionOverrideReason?: string
    isOfflineCreated?: boolean
    hlcTimestamp?: string
    createdAt?: string
  }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenMedicationRequest(payload: FhirMedicationRequestPayload): Record<string, unknown> {
  const cc = payload.medicationCodeableConcept
  return {
    id: payload.id,
    resourceType: 'MedicationRequest',
    status: payload.status ?? null,
    prescriptionStatus: payload._ultranos?.prescriptionStatus ?? null,
    intent: payload.intent ?? 'order',
    // medication_codeable_concept is a TEXT column — store the CodeableConcept as
    // JSON text (db.toRow does not stringify non-encrypted fields).
    medicationCodeableConcept: cc ? JSON.stringify(cc) : null,
    medicationDisplay: cc?.coding?.[0]?.display ?? null,   // standardized, non-PHI
    medicationText: cc?.text ?? null,                      // PHI — encrypted by db.toRow (randomizedFields)
    subjectReference: (payload.subject?.reference ?? '').replace(/^Patient\//, '') || null,
    encounterReference: (payload.encounter?.reference ?? '').replace(/^Encounter\//, '') || null,
    requesterId: (payload.requester?.reference ?? '').replace(/^Practitioner\//, '') || null,
    authoredOn: payload.authoredOn ?? null,
    dosageInstruction: payload.dosageInstruction ?? null,  // jsonb — encrypted by db.toRow (randomizedFields)
    dispenseRequest: payload.dispenseRequest ?? null,      // jsonb
    interactionCheck: payload._ultranos?.interactionCheckResult ?? null,
    interactionOverride: payload._ultranos?.interactionOverrideReason ?? null, // encrypted by db.toRow
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    metaLastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    metaVersionId: payload.meta?.versionId ?? '1',
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// WholesaleCustomer → wholesale_customers table
// ---------------------------------------------------------------------------

function flattenWholesaleCustomer(p: any): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    contactName: p.contactName ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    address: p.address ?? null,
    paymentTermsDays: p.paymentTermsDays ?? null,
    creditLimit: p.creditLimit ?? null,
    ultranosOrgId: p.ultranosOrgId ?? null,
    isActive: p.isActive ?? true,
    createdAt: p.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// SalesOrder → sales_orders table
// ---------------------------------------------------------------------------

function flattenSalesOrder(p: any): Record<string, unknown> {
  return {
    id: p.id,
    orderNumber: p.orderNumber,
    customerId: p.customerId,
    status: p.status,
    lines: p.lines ?? [],
    subtotal: p.subtotal ?? 0,
    taxRate: p.taxRate ?? 0,
    taxAmount: p.taxAmount ?? 0,
    total: p.total ?? 0,
    notes: p.notes ?? null,
    createdBy: p.createdBy,
    fulfilledAt: p.fulfilledAt ?? null,
    cancelledAt: p.cancelledAt ?? null,
    createdAt: p.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// CustomerLedgerEntry → customer_ledger_entries table
// ---------------------------------------------------------------------------

function flattenCustomerLedgerEntry(p: any): Record<string, unknown> {
  return {
    id: p.id,
    customerId: p.customerId,
    type: p.type,
    amount: p.amount,
    salesOrderId: p.salesOrderId ?? null,
    note: p.note ?? null,
    createdBy: p.createdBy,
    entryTimestamp: p.timestamp,
    createdAt: p.timestamp ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// ContractPrice → contract_prices table
// ---------------------------------------------------------------------------

function flattenContractPrice(p: any): Record<string, unknown> {
  return {
    id: p.id,
    customerId: p.customerId,
    catalogItemId: p.catalogItemId,
    price: p.priceMinor,
    tiers: p.tiers ?? [],
    createdBy: p.createdBy,
    createdAt: p.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Supplier → pharmacy_suppliers table
// ---------------------------------------------------------------------------

function flattenSupplier(s: any): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    contactName: s.contactName ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    address: s.address ?? null,
    leadTimeDays: s.leadTimeDays ?? null,
    paymentTerms: s.paymentTerms ?? null,
    isActive: s.isActive ?? true,
    createdAt: s.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// PurchaseOrder → pharmacy_purchase_orders table
// ---------------------------------------------------------------------------

function flattenPurchaseOrder(p: any): Record<string, unknown> {
  return {
    id: p.id,
    supplierId: p.supplierId,
    supplierName: p.supplierName ?? null,
    status: p.status,
    items: p.items ?? [],
    totalCost: p.totalCost ?? 0,
    notes: p.notes ?? null,
    createdBy: p.createdBy,
    sentAt: p.sentAt ?? null,
    closedAt: p.closedAt ?? null,
  }
}

// ---------------------------------------------------------------------------
// GoodsReceipt → goods_receipts table
// ---------------------------------------------------------------------------

function flattenGoodsReceipt(g: any): Record<string, unknown> {
  return {
    id: g.id,
    supplierId: g.supplierId,
    purchaseOrderId: g.purchaseOrderId ?? null,
    receivedBy: g.receivedBy,
    items: g.items ?? [],
    totalCost: g.totalCost ?? 0,
    notes: g.notes ?? null,
    receivedAt: g.receivedAt ?? null,
  }
}

// ---------------------------------------------------------------------------
// StockBatch → stock_batches table
// ---------------------------------------------------------------------------

function flattenStockBatch(b: any): Record<string, unknown> {
  return {
    id: b.id,
    catalogItemId: b.catalogItemId,
    batchNumber: b.batchNumber ?? null,
    lotNumber: b.lotNumber ?? null,
    expiryDate: b.expiryDate ?? null,
    quantityOnHand: b.quantityOnHand ?? 0,
    costPrice: b.costPrice ?? 0,
    sellingPrice: b.sellingPrice ?? 0,
    zoneId: b.zoneId ?? null,
    supplierId: b.supplierId ?? null,
    goodsReceiptId: b.goodsReceiptId ?? null,
    receivedAt: b.receivedAt ?? null,
    status: b.status ?? null,
    locationId: b.locationId ?? null,
  }
}

// ---------------------------------------------------------------------------
// StockMovement → stock_movements table
// ---------------------------------------------------------------------------

function flattenStockMovement(m: any): Record<string, unknown> {
  return {
    id: m.id,
    stockBatchId: m.stockBatchId,
    catalogItemId: m.catalogItemId,
    type: m.type,
    quantity: m.quantity,
    reason: m.reason ?? null,
    referenceId: m.referenceId ?? null,
    referenceType: m.referenceType ?? null,
    performedBy: m.performedBy ?? null,
    // Client sends `timestamp` — mapped to `movementTimestamp` so db.toRow
    // yields the `movement_timestamp` column (snake_case conversion).
    movementTimestamp: m.timestamp,
  }
}

// ---------------------------------------------------------------------------
// StockTransfer → stock_transfers table
// ---------------------------------------------------------------------------

function flattenStockTransfer(t: any): Record<string, unknown> {
  return {
    id: t.id,
    fromLocationId: t.fromLocationId,
    fromLocationName: t.fromLocationName,
    toLocationId: t.toLocationId,
    toLocationName: t.toLocationName,
    status: t.status,
    items: t.items ?? [],
    requestedBy: t.requestedBy,
    requestedAt: t.requestedAt,
    approvedBy: t.approvedBy,
    approvedAt: t.approvedAt,
    shippedAt: t.shippedAt,
    receivedAt: t.receivedAt,
    receivedBy: t.receivedBy,
    cancelledReason: t.cancelledReason,
  }
}

// ---------------------------------------------------------------------------
// StockCount → stock_counts table
// ---------------------------------------------------------------------------

function flattenStockCount(c: any): Record<string, unknown> {
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    countedBy: c.countedBy,
    items: c.items ?? [],
    totalVarianceItems: c.totalVarianceItems ?? 0,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
  }
}

// ---------------------------------------------------------------------------
// Invoice → invoices table (POS, PHI-bearing)
// ---------------------------------------------------------------------------

function flattenInvoice(p: any): Record<string, unknown> {
  return {
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    patientId: p.patientId ?? null,
    dispenseIds: p.dispenseIds ?? [],
    // Client sends `items` — renamed to `invoiceItems` so db.toRow produces
    // the `invoice_items` column, which is in randomizedFields (AES-256-GCM encrypted).
    // Do NOT keep a plain `items` key here — that name collides with non-PHI JSONB
    // columns on PurchaseOrder/GoodsReceipt/StockTransfer/StockCount and would
    // cause those rows to be wrongly encrypted if `items` were in randomizedFields.
    invoiceItems: p.items ?? [],
    subtotal: p.subtotal ?? 0,
    taxRate: p.taxRate ?? 0,
    taxAmount: p.taxAmount ?? 0,
    total: p.total ?? 0,
    amountPaid: p.amountPaid ?? 0,
    amountDue: p.amountDue ?? 0,
    status: p.status,
    createdBy: p.createdBy,
    voidedBy: p.voidedBy ?? null,
    voidedAt: p.voidedAt ?? null,
    voidReason: p.voidReason ?? null,
  }
}

// ---------------------------------------------------------------------------
// Payment → payments table (POS)
// ---------------------------------------------------------------------------

function flattenPayment(p: any): Record<string, unknown> {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    method: p.method,
    amount: p.amount,
    reference: p.reference ?? null,
    cashDrawerId: p.cashDrawerId ?? null,
    receivedBy: p.receivedBy,
    // Client sends `timestamp` — renamed to `paymentTimestamp` to avoid the
    // SQL reserved word `timestamp` as a column name (same precedent as
    // StockMovement's movementTimestamp and LedgerEntry's ledgerTimestamp).
    paymentTimestamp: p.timestamp,
  }
}

// ---------------------------------------------------------------------------
// LedgerEntry → patient_ledger_entries table (POS, PHI-bearing)
// ---------------------------------------------------------------------------

function flattenLedgerEntry(p: any): Record<string, unknown> {
  return {
    id: p.id,
    patientId: p.patientId,
    type: p.type,
    amount: p.amount,
    invoiceId: p.invoiceId ?? null,
    // Client sends `note` — renamed to `ledgerNote` so db.toRow produces the
    // `ledger_note` column, which is in randomizedFields (AES-256-GCM encrypted).
    ledgerNote: p.note ?? null,
    createdBy: p.createdBy,
    // Client sends `timestamp` — renamed to `ledgerTimestamp` (reserved word avoidance,
    // same pattern as paymentTimestamp / movementTimestamp / entryTimestamp).
    ledgerTimestamp: p.timestamp,
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

// Payload param is `any` because each mapper accepts a narrower FHIR payload
// shape; the dispatcher only ever passes a parsed JSON object.
const mappers: Record<string, (payload: any) => Record<string, unknown>> = {
  Encounter: flattenEncounter,
  ClinicalImpression: flattenClinicalImpression,
  Observation: flattenObservation,
  AllergyIntolerance: flattenAllergyIntolerance,
  Condition: flattenCondition,
  MedicationRequest: flattenMedicationRequest,
  Patient: flattenPatient,
  WholesaleCustomer: flattenWholesaleCustomer,
  SalesOrder: flattenSalesOrder,
  CustomerLedgerEntry: flattenCustomerLedgerEntry,
  ContractPrice: flattenContractPrice,
  Supplier: flattenSupplier,
  PurchaseOrder: flattenPurchaseOrder,
  GoodsReceipt: flattenGoodsReceipt,
  StockBatch: flattenStockBatch,
  StockMovement: flattenStockMovement,
  StockTransfer: flattenStockTransfer,
  StockCount: flattenStockCount,
  // POS PHI types — first PHI-bearing org-scoped sync
  Invoice: flattenInvoice,
  Payment: flattenPayment,
  LedgerEntry: flattenLedgerEntry,
}

/**
 * Flatten a FHIR resource payload into the shape expected by the DB table.
 *
 * hlcTimestamp is always injected by the caller (sync.push) after flattening,
 * so mappers should NOT include it — except where it comes from _ultranos
 * (which is stripped during flattening). The caller overwrites with the
 * canonical HLC from the sync operation.
 *
 * Returns the flattened row (camelCase keys). For unmapped resource types,
 * strips `resourceType` and returns as-is with a warning.
 */
export function flattenForDb(
  resourceType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const mapper = mappers[resourceType]
  if (mapper) {
    return mapper(payload)
  }

  // Unmapped resource type — strip resourceType field, pass through.
  // The upsert will likely fail on column mismatch, but that's the
  // existing behavior and those tables may not exist yet anyway.
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[resource-mappers] No mapper for resource type "${resourceType}" — passing through`,
    )
  }
  const { resourceType: _, ...rest } = payload
  return rest
}
