/**
 * Story 49.2 — Twilio SMS Adapter
 *
 * Uses Twilio REST API directly (no SDK — keeps bundle small).
 * Auth via Account SID + Auth Token from config.
 *
 * PHI: message body is passed through to Twilio but NEVER logged.
 */

import type { SmsGatewayAdapter, SmsDeliveryResult, SmsDeliveryStatus } from './sms-gateway'

interface TwilioConfig {
  accountSid: string
  authToken: string
  senderNumber: string
  baseUrl?: string  // Custom base URL for local/regional providers
}

export class TwilioSmsAdapter implements SmsGatewayAdapter {
  private readonly accountSid: string
  private readonly authToken: string
  private readonly senderNumber: string
  private readonly baseUrl: string

  constructor(config: TwilioConfig) {
    this.accountSid = config.accountSid
    this.authToken = config.authToken
    this.senderNumber = config.senderNumber
    this.baseUrl = config.baseUrl ?? `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`
  }

  async send(params: { to: string; body: string; from?: string }): Promise<SmsDeliveryResult> {
    const from = params.from ?? this.senderNumber
    const url = `${this.baseUrl}/Messages.json`

    const body = new URLSearchParams({
      To: params.to,
      From: from,
      Body: params.body,
    })

    const credentials = btoa(`${this.accountSid}:${this.authToken}`)

    let resp: Response
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      })
    } catch {
      return { messageId: '', status: 'failed', errorCode: 'NETWORK_ERROR' }
    }

    if (!resp.ok) {
      const errorCode = `HTTP_${resp.status}`
      return { messageId: '', status: 'failed', errorCode }
    }

    const data = (await resp.json()) as {
      sid?: string
      status?: string
      error_code?: string | null
    }

    if (data.error_code) {
      return {
        messageId: data.sid ?? '',
        status: 'failed',
        errorCode: String(data.error_code),
      }
    }

    const twilioStatus = data.status ?? 'queued'
    const mappedStatus: 'queued' | 'sent' | 'failed' =
      twilioStatus === 'failed' || twilioStatus === 'undelivered'
        ? 'failed'
        : twilioStatus === 'sent' || twilioStatus === 'delivered'
          ? 'sent'
          : 'queued'

    return { messageId: data.sid ?? '', status: mappedStatus }
  }

  async checkStatus(messageId: string): Promise<SmsDeliveryStatus> {
    const url = `${this.baseUrl}/Messages/${messageId}.json`
    const credentials = btoa(`${this.accountSid}:${this.authToken}`)

    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}` },
      })
      if (!resp.ok) return 'failed'

      const data = (await resp.json()) as { status?: string }
      const s = data.status ?? ''
      if (s === 'delivered') return 'delivered'
      if (s === 'sent') return 'sent'
      if (s === 'failed' || s === 'undelivered') return 'failed'
      return 'queued'
    } catch {
      return 'failed'
    }
  }
}
