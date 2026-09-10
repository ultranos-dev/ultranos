/**
 * Curated starter catalog of common lab tests (LOINC-coded) for order entry.
 *
 * Test display names are standardized clinical labels (LOINC) — like drug names,
 * they are NOT localized; the surrounding UI chrome is translated via i18n.
 * This is a pragmatic starter set; a full synced lab-test vocabulary (mirroring
 * the drug catalog) can replace it later without changing the order-entry contract.
 */
export interface LabTestCatalogItem {
  /** LOINC code. */
  code: string
  /** Standardized clinical display. */
  display: string
  /** Coarse grouping for the picker (optgroup). */
  category: 'Hematology' | 'Chemistry' | 'Endocrine' | 'Microbiology' | 'Urinalysis'
}

export const LAB_TEST_CATALOG: readonly LabTestCatalogItem[] = [
  // Hematology
  { code: '58410-2', display: 'Complete blood count (CBC) panel', category: 'Hematology' },
  { code: '718-7', display: 'Hemoglobin', category: 'Hematology' },
  { code: '4544-3', display: 'Hematocrit', category: 'Hematology' },
  { code: '777-3', display: 'Platelet count', category: 'Hematology' },
  { code: '5902-2', display: 'Prothrombin time (PT)', category: 'Hematology' },
  // Chemistry
  { code: '24323-8', display: 'Basic metabolic panel (BMP)', category: 'Chemistry' },
  { code: '24325-3', display: 'Liver function panel (LFT)', category: 'Chemistry' },
  { code: '2345-7', display: 'Glucose', category: 'Chemistry' },
  { code: '2160-0', display: 'Creatinine', category: 'Chemistry' },
  { code: '2951-2', display: 'Sodium', category: 'Chemistry' },
  { code: '2823-3', display: 'Potassium', category: 'Chemistry' },
  { code: '2093-3', display: 'Cholesterol, total', category: 'Chemistry' },
  // Endocrine
  { code: '4548-4', display: 'Hemoglobin A1c', category: 'Endocrine' },
  { code: '3016-3', display: 'Thyroid stimulating hormone (TSH)', category: 'Endocrine' },
  // Microbiology
  { code: '600-7', display: 'Bacteria identified, culture', category: 'Microbiology' },
  { code: '11475-1', display: 'Microscopic observation, smear', category: 'Microbiology' },
  // Urinalysis
  { code: '24356-8', display: 'Urinalysis panel', category: 'Urinalysis' },
  { code: '5811-5', display: 'Specific gravity, urine', category: 'Urinalysis' },
] as const

/** Priority options for a ServiceRequest (FHIR ServiceRequest.priority). */
export const LAB_ORDER_PRIORITIES = ['routine', 'urgent', 'asap', 'stat'] as const
export type LabOrderPriority = (typeof LAB_ORDER_PRIORITIES)[number]
