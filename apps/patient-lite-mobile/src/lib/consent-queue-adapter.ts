/**
 * Bridge function: FhirConsent → sync-engine EnqueueInput.
 *
 * Converts a FHIR Consent resource into the shape expected by
 * @ultranos/sync-engine's queue, enabling the DrainWorker to
 * push consent changes to the Hub.
 */
import type { FhirConsent } from '@ultranos/shared-types'
import type { EnqueueSyncActionInput } from '@ultranos/sync-engine'
import { serializeHlc } from '@ultranos/sync-engine'
import { getSharedHlc } from '@/lib/hlc-singleton'

/**
 * Convert a FhirConsent into an EnqueueSyncActionInput for the sync-engine queue.
 */
export function consentToEnqueueInput(consent: FhirConsent): EnqueueSyncActionInput {
  return {
    resourceType: 'Consent',
    resourceId: consent.id,
    action: 'create',
    payload: JSON.parse(JSON.stringify(consent)),
    hlcTimestamp: serializeHlc(getSharedHlc().now()),
  }
}

/** @deprecated Use _resetSharedHlc from hlc-singleton.ts for testing. */
export { _resetSharedHlc as _resetHlc } from '@/lib/hlc-singleton'
