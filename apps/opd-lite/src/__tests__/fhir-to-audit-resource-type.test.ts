import { describe, it, expect } from 'vitest'
import { fhirToAuditResourceType, AuditResourceType } from '@/lib/audit'

// The Hub's audit.sync claimable-resourceType allowlist (apps/hub-api/src/trpc/
// routers/audit.ts). Every value this mapper can emit MUST be in this set, or a
// drained audit batch containing it 400s and drops EVERY event in the batch (Rule #6).
const CLIENT_CLAIMABLE = new Set<AuditResourceType>([
  AuditResourceType.PATIENT,
  AuditResourceType.PRESCRIPTION,
  AuditResourceType.LAB_RESULT,
  AuditResourceType.CLINICAL_NOTE,
  AuditResourceType.OBSERVATION,
  AuditResourceType.ENCOUNTER,
  AuditResourceType.CONSENT,
  AuditResourceType.USER_ACCOUNT,
  AuditResourceType.NOTIFICATION,
  AuditResourceType.ALLERGY,
  AuditResourceType.MEDICATION_STATEMENT,
  AuditResourceType.MEDICATION_DISPENSE,
  AuditResourceType.APPOINTMENT,
  AuditResourceType.SERVICE_REQUEST,
  AuditResourceType.DIAGNOSTIC_REPORT,
  AuditResourceType.SYSTEM,
  AuditResourceType.PRACTITIONER,
  AuditResourceType.LAB_SAMPLE,
  AuditResourceType.SPECIMEN,
  AuditResourceType.TEMPERATURE_MONITORING,
  AuditResourceType.WASTE_CONTAINER,
  AuditResourceType.EMPLOYEE_HEALTH,
  AuditResourceType.SHIFT_HANDOVER,
  AuditResourceType.CONSULTATION,
  AuditResourceType.DATA_BUDGET,
  AuditResourceType.AI_PROVENANCE,
  AuditResourceType.CASH_DRAWER,
  AuditResourceType.INVOICE,
  AuditResourceType.REFUND,
  AuditResourceType.GOODS_RECEIPT,
  AuditResourceType.PURCHASE_ORDER,
  AuditResourceType.STOCK_BATCH,
  AuditResourceType.SUPPLIER_INVOICE,
  AuditResourceType.SUPPLIER_PAYMENT,
  AuditResourceType.SUPPLY_REQUEST,
])

describe('fhirToAuditResourceType', () => {
  // The exact FHIR resourceType strings the sync layer enqueues/pulls.
  const cases: Array<[string, AuditResourceType]> = [
    ['Patient', AuditResourceType.PATIENT],
    ['Observation', AuditResourceType.OBSERVATION],
    ['Encounter', AuditResourceType.ENCOUNTER],
    ['Condition', AuditResourceType.CLINICAL_NOTE],
    ['MedicationRequest', AuditResourceType.PRESCRIPTION],
    ['MedicationStatement', AuditResourceType.MEDICATION_STATEMENT],
    ['AllergyIntolerance', AuditResourceType.ALLERGY],
    ['ServiceRequest', AuditResourceType.SERVICE_REQUEST],
    ['DiagnosticReport', AuditResourceType.DIAGNOSTIC_REPORT],
    ['ClinicalImpression', AuditResourceType.CLINICAL_NOTE],
    ['Appointment', AuditResourceType.APPOINTMENT],
  ]

  it.each(cases)('maps FHIR %s → %s', (fhir, expected) => {
    expect(fhirToAuditResourceType(fhir)).toBe(expected)
  })

  it('regression: Observation must never pass through as the FHIR-cased string (audit.sync 400)', () => {
    // The bug: `entry.resourceType as AuditResourceType` emitted 'Observation',
    // which the Hub enum rejects. It must become the uppercase enum value.
    expect(fhirToAuditResourceType('Observation')).toBe('OBSERVATION')
    expect(fhirToAuditResourceType('Observation')).not.toBe('Observation')
  })

  it('every mapped FHIR type resolves to a Hub-claimable audit resourceType', () => {
    for (const [fhir] of cases) {
      expect(CLIENT_CLAIMABLE.has(fhirToAuditResourceType(fhir))).toBe(true)
    }
  })

  it('passes through an already-valid audit-domain value', () => {
    expect(fhirToAuditResourceType('OBSERVATION')).toBe(AuditResourceType.OBSERVATION)
    expect(fhirToAuditResourceType('PATIENT')).toBe(AuditResourceType.PATIENT)
  })

  it('falls back to SYSTEM (a claimable value) for an unknown type — never an invalid one', () => {
    const result = fhirToAuditResourceType('SomeUnknownResource')
    expect(result).toBe(AuditResourceType.SYSTEM)
    expect(CLIENT_CLAIMABLE.has(result)).toBe(true)
  })
})
