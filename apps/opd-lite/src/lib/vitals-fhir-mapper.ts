/**
 * Moved to @ultranos/patient-kit (shared with pharmacy-lite + lab-lite). This file
 * re-exports to keep OPD-Lite's existing `@/lib/vitals-fhir-mapper` import paths unchanged.
 */
export { LOINC, mapVitalsToObservations } from '@ultranos/patient-kit/lib/vitals-fhir-mapper'
