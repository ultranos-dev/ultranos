// ---------------------------------------------------------------------------
// Story 50.1 — Auto-Compiled HMIS Monthly Report
// Afghan MoPH HMIS data model — aggregate statistics only, no PHI.
// All fields are de-identified counts, rates, and demographic breakdowns.
// ---------------------------------------------------------------------------

export interface HmisMonthlyReport {
  id: string                           // UUID v4
  reportMonth: number                  // 1-12
  reportYear: number                   // e.g., 2026
  facilityName: string                 // Lab name from settings
  facilityProvince: string             // Province from settings
  facilityDistrict: string             // District from settings
  status: 'draft' | 'finalized'
  generatedAt: string                  // ISO 8601
  generatedBy: string                  // Practitioner ID (opaque)
  finalizedAt?: string                 // ISO 8601
  finalizedBy?: string                 // Practitioner ID (opaque)
  testCategorySummary: TestCategorySummary[]
  positivityRates: PositivityRateEntry[]
  demographics: DemographicBreakdown[]
  reagentConsumption: ReagentConsumptionEntry[]
  qualityIndicators: QualityIndicators
  corrections: ReportCorrection[]      // Manual corrections made during review
  syncStatus: 'pending' | 'synced'
}

export interface TestCategorySummary {
  loincCode: string
  categoryLabel: string
  totalPerformed: number
  totalPositive: number
  totalNegative: number
  positivityRate: number               // Percentage (0-100), 2 decimal precision
}

export interface PositivityRateEntry {
  diseaseCode: string                  // e.g., 'malaria', 'tb', 'hep_b', 'hep_c'
  diseaseLabel: string
  totalTested: number
  totalPositive: number
  positivityRate: number               // Percentage (0-100), 2 decimal precision
  previousMonthRate?: number           // For comparison column
}

export type AgeGroup = '0-4' | '5-14' | '15-24' | '25-44' | '45-64' | '65+'

export const AGE_GROUPS: AgeGroup[] = ['0-4', '5-14', '15-24', '25-44', '45-64', '65+']

export interface DemographicBreakdown {
  ageGroup: AgeGroup
  male: number
  female: number
  unknown: number
  total: number
}

export interface ReagentConsumptionEntry {
  reagentName: string
  unitsConsumed: number
  unitsRemaining: number
  estimatedDaysRemaining: number
}

export interface QualityIndicators {
  totalSamplesReceived: number
  rejectedSamples: number
  rejectionRate: number                // Percentage (0-100), 2 decimal precision
  qcPassRate: number                   // Percentage (0-100), 2 decimal precision
  averageTatHours: number              // Average turnaround time in hours
}

export interface ReportCorrection {
  fieldPath: string                    // e.g., 'testCategorySummary[2].totalPositive'
  originalValue: number | string
  correctedValue: number | string
  correctedBy: string                  // Practitioner ID (opaque)
  correctedAt: string                  // ISO 8601
}
