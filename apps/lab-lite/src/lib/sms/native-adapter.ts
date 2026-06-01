/**
 * Story 49.2 — Native SMS Adapter
 *
 * Uses `sms:` URI scheme (Android SMS intent) as a zero-dependency fallback.
 * Opens the device's native SMS app pre-filled with the message.
 * The user taps Send — delivery confirmation is not available programmatically.
 *
 * Works on Android Chrome PWAs. Not supported on iOS (iOS blocks sms: intents
 * from web apps). Lab-Lite's primary deployment is Android tablets — acceptable.
 *
 * Status tracking is limited to 'queued' after the intent is fired.
 */

import type { SmsGatewayAdapter, SmsDeliveryResult } from './sms-gateway'
import { generateMessageId } from './message-formatter'

export class NativeSmsAdapter implements SmsGatewayAdapter {
  async send(params: { to: string; body: string }): Promise<SmsDeliveryResult> {
    const messageId = generateMessageId()

    try {
      // sms: URI scheme — opens the native SMS app pre-filled
      const smsUri = `sms:${encodeURIComponent(params.to)}?body=${encodeURIComponent(params.body)}`

      if (typeof window !== 'undefined') {
        window.open(smsUri, '_blank')
      }

      // Native adapter cannot confirm delivery programmatically
      return { messageId, status: 'queued' }
    } catch {
      return { messageId, status: 'failed', errorCode: 'NATIVE_SMS_UNAVAILABLE' }
    }
  }

  // Native adapter cannot check delivery status — no gateway tracking
  // checkStatus is intentionally omitted (optional in the interface)
}
