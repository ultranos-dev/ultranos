/**
 * Shared singleton HLC instance for Patient Lite Mobile.
 *
 * All sync-engine enqueue paths must use this single clock to guarantee
 * monotonic, causally comparable timestamps across consent, profile,
 * and medical history sync entries.
 */
import { HybridLogicalClock } from '@ultranos/sync-engine'

let hlcInstance: HybridLogicalClock | null = null

export function getSharedHlc(): HybridLogicalClock {
  if (!hlcInstance) {
    const nodeId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `patient-mobile-${Date.now()}`
    hlcInstance = new HybridLogicalClock(nodeId)
  }
  return hlcInstance
}

/** Reset the shared HLC — only for testing. */
export function _resetSharedHlc(): void {
  hlcInstance = null
}
