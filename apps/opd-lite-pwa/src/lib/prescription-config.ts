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
})
