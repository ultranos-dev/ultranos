/**
 * delegate-notification.ts — Story 45.3 Family Delegate Result Access
 *
 * Queues an SMS notification for the family delegate when a lab result is
 * authorized and ready. Lab-Lite cannot send SMS directly — this enqueues
 * a sync event that the Hub API dispatches via an SMS gateway.
 *
 * Data minimization: the SMS payload contains ONLY the receipt code and a
 * generic "results ready" message. NO patient name, NO test names, NO results.
 */

import { getDelegatesByPatient, enqueueSyncEvent } from './db'
import { hlc, serializeHlc } from './hlc'

export interface DelegateNotificationPayload {
  receiptCode: string
  // Encrypted phone stored on the Hub side for SMS dispatch.
  // Lab-Lite passes the delegate record ID; Hub resolves the phone via its own store.
  delegateId: number
  patientRef: string   // opaque Patient/<uuid> — for Hub-side audit only
}

/**
 * Check if the patient has an active family delegate and, if so, queue an
 * SMS notification for that delegate with the result receipt code.
 *
 * Called after a result is authorized (Story 42.5 integration point).
 * If no active delegate exists, this is a no-op.
 *
 * @returns The delegate record ID if a notification was queued, else null.
 */
export async function queueDelegateNotification(
  patientRef: string,
  receiptCode: string,
): Promise<number | null> {
  const delegates = await getDelegatesByPatient(patientRef)
  const activeDelegate = delegates.find((d) => d.status === 'active')

  if (!activeDelegate || activeDelegate.id == null) {
    return null
  }

  const payload: DelegateNotificationPayload = {
    receiptCode,
    delegateId: activeDelegate.id,
    patientRef,
    // NOTE: SMS message text is constructed on the Hub side from a template:
    // "Lab results are ready. Use code [CODE] in the health app to view."
    // Lab-Lite does NOT include patient name, test names, or clinical data.
  }

  await enqueueSyncEvent({
    resourceType: 'DelegateNotification',
    resourceId: `delegate-${activeDelegate.id}-${receiptCode}`,
    payload,
    hlcTimestamp: serializeHlc(hlc.now()),
  })

  return activeDelegate.id
}

/**
 * Build the SMS message text for a delegate notification.
 * This is used for testing the data minimization contract (Task 7.3).
 * The actual SMS is sent by the Hub, but the message template is defined here.
 *
 * MUST contain ONLY: receipt code + generic "results ready" message.
 * MUST NOT contain: patient name, test names, diagnoses, raw values.
 */
export function buildDelegateSmsText(receiptCode: string): string {
  return `Lab results are ready. Use code ${receiptCode} in the health app to view.`
}
