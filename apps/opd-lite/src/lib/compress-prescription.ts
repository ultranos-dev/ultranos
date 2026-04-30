import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

/**
 * Minified prescription payload for QR encoding.
 * Strips verbose FHIR system URIs, internal metadata, and PHI.
 * Keeps only: medication identity, dosage, duration, references, and timestamp.
 */

interface CompactDosage {
  qty: number
  unit: string
  freq?: string
  freqN?: number
  per?: number
  perU?: string
  prn?: true
}

interface CompactRx {
  id: string
  med: string       // medication code
  medN: string      // medication display name
  medT: string      // full text (name + strength + form)
  dos: CompactDosage
  dur: number       // duration in days
  enc?: string      // encounter ID (stripped prefix, omitted when absent)
  req: string       // requester ref (stripped prefix)
  pat: string       // patient ID (stripped prefix)
  at: string        // authoredOn ISO
}

function stripRef(ref: string): string {
  // "Patient/p-123" → "p-123"
  const idx = ref.indexOf('/')
  return idx >= 0 ? ref.slice(idx + 1) : ref
}

function compactDosage(rx: FhirMedicationRequestZod): CompactDosage {
  const d = rx.dosageInstruction?.[0]
  const dr = d?.doseAndRate?.[0]?.doseQuantity
  const timing = d?.timing?.repeat

  const result: CompactDosage = {
    qty: dr?.value ?? 0,
    unit: dr?.unit ?? '',
  }

  if (timing) {
    if (timing.frequency) result.freqN = timing.frequency
    if (timing.period) result.per = timing.period
    if (timing.periodUnit) result.perU = timing.periodUnit
    // Extract frequency code from timing.code
    const freqCode = d?.timing?.code?.coding?.[0]?.code
    if (freqCode) result.freq = freqCode
  }

  if (d?.asNeededBoolean) result.prn = true

  return result
}

export function compressPrescription(rxList: FhirMedicationRequestZod[]): string {
  if (rxList.length === 0) {
    throw new Error('At least one prescription is required')
  }

  const compact: CompactRx[] = rxList.map((rx) => {
    const result: CompactRx = {
      id: rx.id,
      med: rx.medicationCodeableConcept.coding?.[0]?.code ?? '',
      medN: rx.medicationCodeableConcept.coding?.[0]?.display ?? '',
      medT: rx.medicationCodeableConcept.text ?? '',
      dos: compactDosage(rx),
      dur: rx.dispenseRequest?.expectedSupplyDuration?.value ?? 0,
      req: stripRef(rx.requester.reference),
      pat: stripRef(rx.subject.reference),
      at: rx.authoredOn,
    }

    const encRef = rx.encounter?.reference
    if (encRef) result.enc = stripRef(encRef)

    return result
  })

  return JSON.stringify(compact)
}
