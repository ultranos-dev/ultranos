# Story 49.2: SMS Fallback for Critical Results

Status: done

## Story

As a lab technician with no internet connectivity,
I want critical results to be sent to the ordering physician via SMS,
So that life-threatening findings reach the doctor even during a complete internet blackout.

## Context

Story 48.4 (Critical Value Escalation Chain) defines a multi-step escalation for critical results: full-screen tech alert -> in-app OPD-Lite notification -> 15-min SMS to physician -> 30-min SMS to medical director -> 60-min district health officer flag. That escalation assumes internet connectivity for at least the in-app notification step. This story handles the case where internet is completely unavailable — the escalation chain cannot deliver via in-app notification at all, and SMS becomes the *primary* delivery mechanism rather than a fallback step.

In many Lab-Lite deployment environments (rural Afghanistan, conflict zones), internet outages can last hours or days. Critical lab values (e.g., Potassium > 6.5 mmol/L, Glucose < 40 mg/dL, Hemoglobin < 5 g/dL) are life-threatening and must reach the ordering physician regardless of connectivity. SMS networks operate independently of internet infrastructure and remain functional in most scenarios short of total infrastructure collapse.

**Key constraint:** SMS messages must contain NO PHI beyond what is clinically necessary for the critical value alert. The message format is codified and compressed — no free-text patient data, no diagnosis, no demographics.

**Existing infrastructure:**
- Notification system: `apps/lab-lite/src/components/notifications/` — in-app notification bell and panel
- Audit client: `apps/lab-lite/src/lib/audit-client.ts` — audit event emission
- Upload queue: `apps/lab-lite/src/lib/upload-queue-worker.ts` — pattern for retry/backoff
- Auth session: `apps/lab-lite/src/stores/auth-session-store.ts` — current user context

**PRD Requirements:** FR49 (Offline Resilience & Communication)
**Dependencies:** Story 48.4 (Critical Value Escalation Chain — defines escalation steps and critical thresholds)

## Acceptance Criteria

1. [ ] An SMS gateway integration module can send SMS messages via a configurable provider (Twilio as default, with an adapter pattern for local Afghan/regional providers).
2. [ ] When the escalation chain (Story 48.4) determines that in-app notification delivery is not possible (device offline), the system triggers SMS fallback for critical values only.
3. [ ] The SMS message format is: `"[LabCode] CRITICAL: Pt [ID-code] [TestCode] [Value][Unit] — Reply CONFIRM [code]"` — maximum 160 characters (single SMS segment), no PHI beyond the clinical necessity of the critical value.
4. [ ] The system tracks SMS delivery status: `queued`, `sent`, `delivered`, `failed`, `confirmed` — stored in Dexie for offline resilience.
5. [ ] The physician can confirm receipt by replying to the SMS with a confirmation code. The system processes the reply (via webhook when connectivity is restored) and marks the critical alert as acknowledged.
6. [ ] SMS fallback is ONLY triggered for critical values, never for routine results. The trigger condition checks the critical flag from Story 48.4's threshold configuration.
7. [ ] Every SMS send attempt, delivery status update, and physician confirmation is audit-logged via `emitClientAudit()`.
8. [ ] The SMS module works with device-native SMS capabilities (Android SMS intent) as a zero-dependency fallback when no SMS gateway API is reachable.
9. [ ] SMS gateway configuration (provider, API key, sender number) is configurable in settings by the lab manager role.
10. [ ] Rate limiting prevents more than 5 SMS messages per critical result (across all escalation steps) and no more than 20 SMS messages per hour per device.
11. [ ] Tests cover: message format validation (160-char limit, no PHI leakage), delivery status tracking, confirmation code matching, rate limiting, offline queue behavior, and audit event emission.

## Tasks / Subtasks

- [ ] **Task 1: SMS Gateway Adapter Interface** (AC: 1, 8)
  - [ ] Create `apps/lab-lite/src/lib/sms/sms-gateway.ts`.
  - [ ] Define the gateway adapter interface:
    ```typescript
    interface SmsGatewayAdapter {
      send(params: { to: string; body: string; from?: string }): Promise<SmsDeliveryResult>
      checkStatus?(messageId: string): Promise<SmsDeliveryStatus>
    }
    
    interface SmsDeliveryResult {
      messageId: string
      status: 'queued' | 'sent' | 'failed'
      errorCode?: string
    }
    
    type SmsDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'confirmed'
    ```
  - [ ] Implement `TwilioSmsAdapter` in `apps/lab-lite/src/lib/sms/twilio-adapter.ts`:
    - Uses Twilio REST API (no SDK — keep bundle small).
    - Auth via Account SID + Auth Token from config.
    - Sends POST to `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`.
  - [ ] Implement `NativeSmsAdapter` in `apps/lab-lite/src/lib/sms/native-adapter.ts`:
    - Uses `sms:` URI scheme / Android intent as a zero-dependency fallback.
    - Opens the device SMS app pre-filled with the message (user taps Send).
    - Status tracking is limited to `queued` (cannot confirm delivery programmatically).
  - [ ] Adapter selection: try API gateway first, fall back to native if gateway is unreachable.

- [ ] **Task 2: SMS Message Formatter** (AC: 3)
  - [ ] Create `apps/lab-lite/src/lib/sms/message-formatter.ts`.
  - [ ] Export `formatCriticalSms(params)`:
    ```typescript
    interface CriticalSmsParams {
      labCode: string       // short lab identifier (e.g., "KBL-04")
      patientIdCode: string // opaque short ID, NOT name (e.g., "A7K9")
      testCode: string      // LOINC short code or abbreviation (e.g., "K+" for Potassium)
      value: string         // the critical value (e.g., "7.2")
      unit: string          // unit (e.g., "mmol/L")
      confirmCode: string   // 4-char alphanumeric code for reply confirmation
    }
    ```
  - [ ] Output format: `"KBL-04 CRITICAL: Pt A7K9 K+ 7.2mmol/L — Reply CONFIRM X4K2"`
  - [ ] Enforce 160-character maximum. If the message exceeds 160 chars, truncate the test code display name (never truncate the value or confirmation code).
  - [ ] PHI validation: the formatter must NEVER accept or include patient name, DOB, diagnosis, or any demographic data. Accept only opaque IDs and coded values.

- [ ] **Task 3: SMS Delivery Queue (Dexie)** (AC: 4, 10)
  - [ ] Extend `LabLiteDatabase` in `db.ts` with an `smsQueue` table (version increment):
    ```typescript
    interface SmsQueueEntry {
      id?: number
      messageId?: string       // from gateway response
      recipientPhone: string
      messageBody: string
      confirmCode: string
      criticalResultRef: string // reference to the DiagnosticReport
      status: SmsDeliveryStatus
      escalationStep: number   // 1 = physician, 2 = director, 3 = DHO
      attempts: number
      lastAttemptAt: string | null
      createdAt: string
      confirmedAt: string | null
    }
    ```
  - [ ] Index on `[status, createdAt]` for queue processing and `[criticalResultRef, escalationStep]` for deduplication.
  - [ ] Rate limiter: `canSendSms(criticalResultRef, deviceId)` checks:
    - No more than 5 SMS per critical result (across all escalation steps).
    - No more than 20 SMS per hour from this device.
    - Returns `{ allowed: boolean; reason?: string }`.

- [ ] **Task 4: SMS Escalation Integration** (AC: 2, 5, 6)
  - [ ] Create `apps/lab-lite/src/lib/sms/critical-sms-dispatcher.ts`.
  - [ ] Export `dispatchCriticalSms(criticalResult)`:
    - Checks: is this a critical value? (uses thresholds from Story 48.4 configuration).
    - Checks: is the device offline? (navigator.onLine === false).
    - Checks: has the escalation chain already delivered via in-app notification? (checks notification acknowledgment status).
    - If SMS is warranted: formats the message, queues it, attempts gateway send, falls back to native.
  - [ ] Escalation timing (when offline, these run on local timers):
    - Step 1 (immediate): SMS to ordering physician.
    - Step 2 (15 min, no confirmation): SMS to facility medical director.
    - Step 3 (30 min, no confirmation): SMS to district health officer.
  - [ ] Confirmation processing:
    - When connectivity returns, check for inbound SMS confirmations via the gateway webhook.
    - Match confirmation codes to `smsQueue` entries.
    - Mark as `confirmed` and stop further escalation for that critical result.
  - [ ] Generate unique 4-character alphanumeric confirmation codes (collision-resistant within a 24-hour window).

- [ ] **Task 5: SMS Gateway Configuration UI** (AC: 9)
  - [ ] Add an "SMS Gateway" section to `LabSettingsView.tsx` (visible to lab_manager role only):
    - Provider selector: Twilio / Local Provider / Native Only.
    - API credentials fields (Account SID, Auth Token) — stored encrypted in Dexie, never in localStorage.
    - Sender number configuration.
    - "Test SMS" button: sends a test message to the configured number.
  - [ ] Guard with role check: only `lab_manager` can configure SMS settings.

- [ ] **Task 6: Audit Logging** (AC: 7)
  - [ ] Add `reportSmsAuditEvent()` to `audit-client.ts`:
    ```typescript
    interface SmsAuditPayload {
      action: 'SMS_QUEUED' | 'SMS_SENT' | 'SMS_DELIVERED' | 'SMS_FAILED' | 'SMS_CONFIRMED' | 'SMS_RATE_LIMITED'
      smsQueueEntryId: number
      criticalResultRef: string
      escalationStep: number
      recipientRole: string  // 'physician' | 'medical_director' | 'dho'
      // NEVER include phone number or message content in audit
    }
    ```
  - [ ] Emit on: queue entry creation, send attempt, delivery status update, confirmation receipt, rate limit hit.
  - [ ] PHI guard: audit metadata must NEVER include the phone number, message body, patient ID code, or test values. Only opaque references and status codes.

- [ ] **Task 7: Webhook Handler for Confirmations** (AC: 5)
  - [ ] Create `apps/lab-lite/src/lib/sms/confirmation-handler.ts`.
  - [ ] When connectivity is restored, poll the gateway for inbound messages (or register a webhook endpoint on the Hub API to relay confirmations).
  - [ ] Match inbound SMS body against expected confirmation codes in the `smsQueue`.
  - [ ] On match: update status to `confirmed`, emit audit event, cancel pending escalation timers.
  - [ ] On no match: log as unrecognized reply, do not escalate.

- [ ] **Task 8: Tests** (AC: 11)
  - [ ] Create `apps/lab-lite/src/__tests__/sms-critical-fallback.test.ts`:
    - Test: message format is exactly 160 chars or fewer for all valid inputs.
    - Test: PHI guard — formatter rejects input with patient name, DOB, or diagnosis fields.
    - Test: delivery status transitions: queued -> sent -> delivered -> confirmed.
    - Test: confirmation code matching (valid code confirms, invalid code does not).
    - Test: rate limiter blocks after 5 SMS per critical result.
    - Test: rate limiter blocks after 20 SMS per hour.
    - Test: escalation timing: step 2 triggers after 15 min without confirmation.
    - Test: audit events emitted for each status transition.
    - Test: native adapter fallback when gateway is unreachable.
    - Test: SMS is NOT triggered for non-critical results.

### Review Findings (2026-06-03)

- [x] [Review][Patch] D1: SMS Gateway Configuration UI implemented — SmsGatewayConfig.tsx + LabSettingsView integration
- [x] [Review][Patch] D2: Escalation timers persisted to Dexie smsEscalationSchedule table + checkDueEscalations() recovery
- [x] [Review][Patch] D3: Em-dash replaced with ASCII hyphen for GSM 7-bit compatibility
- [x] [Review][Patch] P1: Dexie v27 schema added — smsQueue, smsGatewayConfig, smsEscalationSchedule tables
- [x] [Review][Patch] P2: reportSmsAuditEvent() added to audit-client.ts
- [x] [Review][Patch] P3: TwilioSmsAdapter baseUrl param — local provider URL now passed through
- [x] [Review][Patch] P4: Native SMS adapter phone number encoding fixed
- [x] [Review][Patch] P5: Escalation checks ANY prior step for confirmation, not just step 1
- [x] [Review][Patch] P6: Audit events emitted for SMS_QUEUED, SMS_SENT, SMS_FAILED, SMS_RATE_LIMITED
- [x] [Review][Patch] P7: Retry mechanism added — retryFailedSms() + attempts incremented
- [x] [Review][Patch] P8: Confirm code collision check via isConfirmCodeActive() before enqueue
- [x] [Review][Patch] P9: Rate limiter excludes failed entries from count
- [x] [Review][Patch] P10: Test confirm codes fixed — uses generateConfirmCode()
- [x] [Review][Patch] P11: PHI guard uses allowlist instead of denylist
- [x] [Review][Patch] P12: Escalation timing test added with vi.advanceTimersByTimeAsync
- [x] [Review][Defer] W1: pollForConfirmations acknowledgment — deferred to Hub API endpoint story

## Dev Notes

### PHI Minimization in SMS

This is the most PHI-sensitive feature in Lab-Lite. The SMS message contains:
- An opaque patient ID code (4-char, NOT the FHIR patient ID or name)
- A coded test abbreviation (e.g., "K+" for Potassium)
- The critical value and unit

This is the minimum information a physician needs to act on a critical result. The opaque patient ID code is a short, rotating identifier that maps to the patient only within the lab's local system — it is not the FHIR `Patient.id` and cannot be used to look up the patient without Lab-Lite access.

### SMS Gateway Costs

Twilio pricing is approximately $0.0075/segment for outgoing SMS in Afghanistan. At 5 SMS per critical result and an estimated 2-3 critical results per month for a typical lab, the cost is negligible (~$0.15/month). However, local providers may be significantly cheaper. The adapter pattern allows swapping providers without code changes.

### Native SMS Fallback

The `sms:` URI scheme opens the device's native SMS app. This works on Android Chrome PWAs but NOT on iOS (iOS restricts SMS intents from web apps). Since Lab-Lite's primary deployment is Android tablets, this is acceptable. The native fallback provides zero-dependency SMS when the gateway API is unreachable (e.g., during the same internet outage that triggered the SMS fallback).

### Confirmation Code Design

Confirmation codes are 4-character alphanumeric (A-Z, 0-9, excluding confusable characters: 0/O, 1/I/L). This gives ~35^4 = ~1.5M combinations, sufficient for collision resistance within a 24-hour window. Codes expire after 24 hours. The physician replies: `CONFIRM X4K2` — simple enough for a stressed clinician to type on a basic phone.

### Integration with Story 48.4

This story extends Story 48.4's escalation chain, not replaces it. The escalation chain in 48.4 is: alert -> in-app notification -> 15-min SMS -> 30-min SMS -> 60-min flag. This story provides the SMS sending infrastructure that 48.4's steps 3-5 depend on. When the device is offline from the start, steps 1-2 are skipped and SMS becomes the immediate delivery channel.

### References

- Story 48.4: Critical Value Escalation Chain (escalation steps, critical thresholds)
- Notification system: `apps/lab-lite/src/components/notifications/`
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Auth session store: `apps/lab-lite/src/stores/auth-session-store.ts`
- Upload queue worker pattern: `apps/lab-lite/src/lib/upload-queue-worker.ts` (retry/backoff)
- Dexie database: `apps/lab-lite/src/lib/db.ts`
