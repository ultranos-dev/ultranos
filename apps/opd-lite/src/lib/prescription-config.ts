/**
 * Clinical frequency abbreviations mapped to FHIR Timing values.
 * Standard abbreviations: QD (once daily), BID (twice daily),
 * TID (three times daily), QID (four times daily).
 */
export interface FrequencyOption {
  code: string
  display: string
  frequency: number
  period: number
  periodUnit: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a'
  asNeeded?: boolean
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { code: 'QD', display: 'Once daily (QD)', frequency: 1, period: 1, periodUnit: 'd' },
  { code: 'BID', display: 'Twice daily (BID)', frequency: 2, period: 1, periodUnit: 'd' },
  { code: 'TID', display: 'Three times daily (TID)', frequency: 3, period: 1, periodUnit: 'd' },
  { code: 'QID', display: 'Four times daily (QID)', frequency: 4, period: 1, periodUnit: 'd' },
  { code: 'Q8H', display: 'Every 8 hours (Q8H)', frequency: 1, period: 8, periodUnit: 'h' },
  { code: 'Q12H', display: 'Every 12 hours (Q12H)', frequency: 1, period: 12, periodUnit: 'h' },
  { code: 'QW', display: 'Once weekly (QW)', frequency: 1, period: 1, periodUnit: 'wk' },
  { code: 'PRN', display: 'As needed (PRN)', frequency: 0, period: 0, periodUnit: 'd', asNeeded: true },
]

/**
 * Route of administration options, keyed by a short internal code and carrying
 * the SNOMED CT route-of-administration concept for FHIR CodeableConcept output.
 */
export interface RouteOption {
  code: string        // internal short code (e.g. 'PO')
  display: string     // human label (e.g. 'Oral')
  snomedCode: string  // SNOMED CT route-of-administration code
}

export const ROUTE_OPTIONS: RouteOption[] = [
  { code: 'PO', display: 'Oral', snomedCode: '26643006' },
  { code: 'IV', display: 'Intravenous', snomedCode: '47625008' },
  { code: 'IM', display: 'Intramuscular', snomedCode: '78421000' },
  { code: 'SC', display: 'Subcutaneous', snomedCode: '34206005' },
  { code: 'TOP', display: 'Topical', snomedCode: '6064005' },
  { code: 'INHALED', display: 'Inhaled', snomedCode: '18679011' },
  { code: 'OPHTH', display: 'Ophthalmic', snomedCode: '54485002' },
  { code: 'PR', display: 'Rectal', snomedCode: '37161004' },
  { code: 'NASAL', display: 'Nasal', snomedCode: '46713006' },
]

/**
 * Best-effort route inference from a dose-form string. Conservative: only maps
 * forms with an unambiguous route, otherwise falls back to oral (the most common
 * outpatient route). The clinician can always override via the Route select.
 */
export function formToRouteDefault(form: string): string {
  const f = form.toLowerCase()
  // Order matters: check the more specific non-oral forms before the oral catch-all.
  if (f.includes('inhal') || f.includes('puff') || f.includes('nebul')) return 'INHALED'
  if (f.includes('patch') || f.includes('transdermal') || f.includes('cream') ||
      f.includes('ointment') || f.includes('gel') || f.includes('lotion') || f.includes('topical')) return 'TOP'
  if (f.includes('suppository') || f.includes('rectal') || f.includes('enema')) return 'PR'
  if (f.includes('eye') || f.includes('ophthalmic')) return 'OPHTH'
  if (f.includes('nasal')) return 'NASAL'
  if (f.includes('inject') || f.includes('vial') || f.includes('ampoule') || f.includes('infusion')) return 'IV'
  // Oral catch-all: tablets, capsules, oral liquids, and anything unrecognised.
  return 'PO'
}

export interface PrescriptionFormData {
  medicationCode: string
  medicationDisplay: string
  medicationForm: string
  medicationStrength: string
  dosageQuantity: string
  dosageUnit: string
  frequencyCode: string
  durationDays: string
  notes: string
  route?: string
  brandHint?: string
  medicationManufacturer?: string
}

export const EMPTY_PRESCRIPTION_FORM: Readonly<PrescriptionFormData> = Object.freeze({
  medicationCode: '',
  medicationDisplay: '',
  medicationForm: '',
  medicationStrength: '',
  dosageQuantity: '1',
  dosageUnit: 'tablet',
  frequencyCode: 'BID',
  durationDays: '7',
  notes: '',
  route: 'PO',
})
