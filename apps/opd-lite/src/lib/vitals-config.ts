/**
 * Moved to @ultranos/patient-kit (shared with pharmacy-lite + lab-lite). This file
 * re-exports to keep OPD-Lite's existing `@/lib/vitals-config` import paths unchanged.
 */
export { vitalsConfig, getVitalRangeStatus } from '@ultranos/patient-kit/lib/vitals-config'
export type { VitalKey } from '@ultranos/patient-kit/lib/vitals-config'
