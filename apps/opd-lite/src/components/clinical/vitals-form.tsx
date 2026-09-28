'use client'

/**
 * Moved to @ultranos/patient-kit so pharmacy-lite and lab-lite share the identical
 * vitals UI. This file re-exports the shared component to keep OPD-Lite's existing
 * import paths (`@/components/clinical/vitals-form`) unchanged.
 */
export { VitalsForm } from '@ultranos/patient-kit/components/clinical/vitals-form'
export type { RangeStatus } from '@ultranos/patient-kit/components/clinical/vitals-form'
