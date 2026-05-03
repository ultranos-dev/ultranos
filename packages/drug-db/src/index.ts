export {
  checkInteractions,
  checkAllergyMatch,
  invalidateCache,
  getMedicationNamesFromStatements,
  buildLookupMapFromEntries,
  STALENESS_THRESHOLD_MS,
} from './checker.js'

export type {
  InteractionResult,
  InteractionCheckSummary,
  InteractionCheckOptions,
  VocabInteractionEntry,
  DrugDatabaseAdapter,
} from './types.js'

export { DrugInteractionSeverity } from './types.js'

export type {
  FhirAllergyIntolerance,
  FhirMedicationStatementZod,
} from './types.js'
