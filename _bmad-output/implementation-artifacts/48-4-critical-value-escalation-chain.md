# Story 48.4: Critical Value Escalation Chain

Status: ready-for-dev

## Story

As a lab supervisor,
I want critical results to trigger an unstoppable notification chain until a physician acknowledges receipt,
So that life-threatening results never sit unread in a notification queue.

## Context

Critical lab values (e.g., Potassium > 6.5 mmol/L, Glucose < 40 mg/dL, Hemoglobin < 5 g/dL) indicate immediate life-threatening conditions. In a well-resourced hospital, a critical result triggers a phone call. In the target environments — a solo tech in a rural Afghan clinic with intermittent connectivity — critical results can easily get lost. The ordering physician might be in another building, offline, or unaware of the result.

This story implements a deterministic, multi-step escalation chain that starts with a full-screen tech alert and escalates through in-app notification, SMS to physician, SMS to facility medical director, and finally a flag to the district health officer. Every step is audit-logged. The escalation is rule-based — no AI judgment. Thresholds are physician-configurable and modifiable by lab managers.

**PRD Requirements:** FR48 (brainstorm #16)
**Epic:** 48 — Intelligent Decision Support

## Acceptance Criteria

1. **Given** a result contains a critical value (configurable thresholds per test), **When** the result is released, **Then** the system triggers a multi-step escalation chain.
2. **Given** the escalation chain is triggered, **When** Step 1 executes, **Then** a full-screen alert is displayed to the releasing tech requiring explicit acknowledgment before any other action.
3. **Given** the tech has acknowledged, **When** Step 2 executes, **Then** an urgent in-app notification is sent to the ordering physician in OPD-Lite.
4. **Given** no physician acknowledgment within 15 minutes, **When** Step 3 executes, **Then** an SMS is sent to the physician's registered phone number.
5. **Given** no acknowledgment within 30 minutes, **When** Step 4 executes, **Then** an SMS is sent to the facility medical director.
6. **Given** no acknowledgment within 60 minutes, **When** Step 5 executes, **Then** the case is flagged to the district health officer.
7. **Given** any escalation step executes, **When** it fires, **Then** the step is audit-logged: notification type, recipient, sent timestamp, acknowledged timestamp (or "escalated").
8. **Given** critical thresholds exist, **When** a lab manager or physician accesses configuration, **Then** the thresholds are configurable per analyte and modifiable.
9. **Given** the escalation chain runs, **When** decisions are made, **Then** the chain is deterministic — no AI judgment, only rules.

## Tasks / Subtasks

- [ ] **Task 1: Dexie Schema — `critical_thresholds`, `escalation_chains`, and `escalation_contacts` Tables** (AC: 1, 8)
  - [ ] Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with `critical_thresholds`, `escalation_chains`, and `escalation_contacts` tables.
  - [ ] Define `CriticalThreshold` interface: `id` (auto-increment), `loincCode` (string), `testName` (string), `analyte` (string — e.g., "Potassium", "Glucose", "Hemoglobin"), `unit` (string — e.g., "mmol/L", "mg/dL", "g/dL"), `criticalLow` (number | null — threshold below which value is critical low), `criticalHigh` (number | null — threshold above which value is critical high), `isActive` (boolean), `configuredBy` (string — practitioner ID), `updatedAt` (string — ISO 8601).
  - [ ] Index: `++id, &[loincCode+analyte], loincCode, isActive`.
  - [ ] Seed default thresholds:
    - Potassium: critical high > 6.5 mmol/L, critical low < 2.5 mmol/L
    - Glucose: critical low < 40 mg/dL, critical high > 500 mg/dL
    - Hemoglobin: critical low < 5 g/dL, critical high > 20 g/dL
    - Sodium: critical low < 120 mmol/L, critical high > 160 mmol/L
    - Creatinine: critical high > 10 mg/dL
    - Calcium: critical low < 6.0 mg/dL, critical high > 13.0 mg/dL
    - WBC: critical low < 2.0 x10^9/L, critical high > 30.0 x10^9/L
    - Platelets: critical low < 50 x10^9/L, critical high > 1000 x10^9/L
  - [ ] Define `EscalationChain` interface: `id` (auto-increment), `chainId` (string — UUID), `resultId` (string — references the lab result), `loincCode` (string), `analyte` (string), `criticalValue` (number), `unit` (string), `criticalDirection` (`'high' | 'low'`), `patientRef` (string — opaque reference, no name), `orderingPhysicianId` (string), `currentStep` (number — 1 through 5), `status` (`'active' | 'acknowledged' | 'expired'`), `steps` (JSON array of `EscalationStep`), `createdAt` (string — ISO 8601), `acknowledgedAt` (string | null), `acknowledgedBy` (string | null).
  - [ ] Define `EscalationStep` interface: `stepNumber` (number 1-5), `type` (`'tech_alert' | 'inapp_notification' | 'sms_physician' | 'sms_director' | 'flag_district'`), `recipientId` (string), `recipientRole` (string), `scheduledAt` (string — ISO 8601), `sentAt` (string | null), `acknowledgedAt` (string | null), `status` (`'pending' | 'sent' | 'acknowledged' | 'escalated' | 'skipped'`).
  - [ ] Index for `escalation_chains`: `++id, &chainId, resultId, status, currentStep, createdAt`.
  - [ ] Define `EscalationContact` interface: `id` (auto-increment), `role` (`'physician' | 'medical_director' | 'district_officer'`), `name` (string), `phoneNumber` (string), `isDefault` (boolean), `updatedAt` (string — ISO 8601).
  - [ ] Index for `escalation_contacts`: `++id, role, isDefault`.

- [ ] **Task 2: Critical Value Detection Engine** (AC: 1, 9)
  - [ ] Create `apps/lab-lite/src/lib/critical-value-engine.ts`.
  - [ ] `isCriticalValue(loincCode: string, analyte: string, value: number): Promise<CriticalValueResult>` — queries `critical_thresholds` in Dexie, returns `{ isCritical: boolean, direction: 'high' | 'low' | null, threshold: number | null, analyte: string }`.
  - [ ] `checkResultForCriticalValues(result: LabResult): Promise<CriticalValueResult[]>` — iterates all numeric fields in a lab result, checks each against thresholds. Returns array of critical findings (a single result can have multiple critical values).
  - [ ] Pure rule-based logic. No ML, no AI, no heuristics. Comparison operators only.
  - [ ] Handle edge cases: null values (skip), non-numeric values (skip), inactive thresholds (skip), missing thresholds for a test (no critical = pass).

- [ ] **Task 3: Escalation Chain Manager** (AC: 1, 2, 3, 4, 5, 6, 7, 9)
  - [ ] Create `apps/lab-lite/src/lib/escalation-manager.ts`.
  - [ ] `initiateEscalation(criticalResult: CriticalValueResult, resultId: string, patientRef: string, orderingPhysicianId: string): Promise<EscalationChain>` — creates a new escalation chain in Dexie with all 5 steps pre-computed:
    - Step 1 (T+0): Full-screen tech alert
    - Step 2 (T+0, after tech ack): In-app notification to ordering physician
    - Step 3 (T+15 min): SMS to ordering physician
    - Step 4 (T+30 min): SMS to facility medical director
    - Step 5 (T+60 min): Flag to district health officer
  - [ ] `acknowledgeStep(chainId: string, stepNumber: number, acknowledgedBy: string): Promise<void>` — marks the step as acknowledged, stops further escalation if the acknowledger is the physician (or higher authority).
  - [ ] `advanceEscalation(chainId: string): Promise<EscalationStep | null>` — checks if current step has timed out, advances to next step, returns the new step to execute (or null if chain is complete/acknowledged).
  - [ ] `getActiveEscalations(): Promise<EscalationChain[]>` — returns all escalation chains with status `active`.
  - [ ] `getEscalationHistory(resultId?: string): Promise<EscalationChain[]>` — returns completed/acknowledged chains for audit review.

- [ ] **Task 4: Escalation Timer Service** (AC: 3, 4, 5, 6)
  - [ ] Create `apps/lab-lite/src/lib/escalation-timer.ts`.
  - [ ] `startEscalationTimer(chainId: string): void` — starts a client-side timer that checks escalation status at 1-minute intervals.
  - [ ] Timer logic: at each tick, calls `advanceEscalation(chainId)`. If a step is returned, executes the appropriate notification action:
    - Step 1: Dispatches full-screen alert event (handled by UI component)
    - Step 2: Calls notification system to push urgent notification to OPD-Lite (via sync queue)
    - Step 3: Calls SMS service to send SMS to physician (via Story 49.2 integration)
    - Step 4: Calls SMS service to send SMS to medical director
    - Step 5: Creates district flag entry in sync queue
  - [ ] `stopEscalationTimer(chainId: string): void` — stops the timer when escalation is acknowledged or expired.
  - [ ] `resumeActiveEscalations(): Promise<void>` — on app startup, queries Dexie for active escalation chains and restarts timers. Handles app restart mid-escalation.
  - [ ] Timer persistence: timers are ephemeral (JavaScript `setInterval`), but escalation state is in Dexie. On app restart, `resumeActiveEscalations` re-creates timers from persisted state.

- [ ] **Task 5: Full-Screen Tech Alert Component** (AC: 2)
  - [ ] Create `apps/lab-lite/src/components/escalation/CriticalValueAlert.tsx`.
  - [ ] Full-screen modal overlay: `fixed inset-0 z-50` with red background/border. Cannot be dismissed by clicking outside or pressing Escape.
  - [ ] Content:
    - Large warning icon (triangle with exclamation — does NOT mirror for RTL)
    - "CRITICAL VALUE" header in bold red
    - Analyte name and value with unit: "Potassium: 7.2 mmol/L (Critical High > 6.5)"
    - Patient reference (opaque — first name + age only per CLAUDE.md Rule #7)
    - Ordering physician name
    - Timestamp
  - [ ] Mandatory acknowledgment: "I have reviewed this critical value and will ensure the ordering physician is notified" checkbox + "Acknowledge" button. Button disabled until checkbox is checked.
  - [ ] Audio alert: play a repeating alert tone (`/sounds/critical-alert.mp3`) until acknowledged. Use Web Audio API with fallback to `<audio>` element.
  - [ ] Acknowledgment records: tech ID, timestamp, writes to escalation chain step 1.
  - [ ] Blocks all other app interaction until acknowledged (modal trap — focus lock).
  - [ ] RTL-aware layout. Text alignment follows locale direction.

- [ ] **Task 6: Critical Threshold Configuration UI** (AC: 8)
  - [ ] Create `apps/lab-lite/src/components/escalation/ThresholdConfigPanel.tsx`.
  - [ ] Table of all configured thresholds: analyte, test name, critical low, critical high, unit, active toggle.
  - [ ] Inline editing for threshold values (critical low, critical high).
  - [ ] Add new threshold: select LOINC code/test, enter analyte name, set thresholds.
  - [ ] Deactivate threshold: toggle `isActive` without deleting (audit trail).
  - [ ] "Reset to defaults" button restores seed values.
  - [ ] Access control: only LAB_MANAGER and physician roles can modify thresholds (check auth session role).
  - [ ] Accessible from Settings page.
  - [ ] Changes persist immediately to Dexie `critical_thresholds` table.

- [ ] **Task 7: Escalation Contact Configuration** (AC: 4, 5, 6)
  - [ ] Create `apps/lab-lite/src/components/escalation/EscalationContactsPanel.tsx`.
  - [ ] Configure contacts for each escalation tier:
    - Default physician: pulled from ordering physician on each order (per-escalation).
    - Medical director: configurable in settings (name, phone number).
    - District health officer: configurable in settings (name, phone number).
  - [ ] Phone number validation: basic format check (digits, optional +country code).
  - [ ] Persist to Dexie `escalation_contacts` table.
  - [ ] Accessible from Settings page alongside threshold configuration.

- [ ] **Task 8: Escalation Status Dashboard** (AC: 7)
  - [ ] Create `apps/lab-lite/src/components/escalation/EscalationStatusList.tsx`.
  - [ ] List of all active escalation chains with: analyte, critical value, patient ref (opaque), current step, time since initiation, status.
  - [ ] Each chain expandable to show step timeline: step number, type, scheduled time, sent time, acknowledged time, status badge.
  - [ ] Color coding: active chains in red border, acknowledged in green, expired in gray.
  - [ ] Acknowledge action: if viewing physician/supervisor can acknowledge receipt from this view.
  - [ ] History tab: completed escalation chains for audit review.

- [ ] **Task 9: Audit Logging** (AC: 7)
  - [ ] Add `reportEscalationEvent()` to `apps/lab-lite/src/lib/audit-client.ts`.
  - [ ] Events: `CRITICAL_VALUE_DETECTED`, `ESCALATION_INITIATED`, `ESCALATION_STEP_SENT`, `ESCALATION_STEP_ACKNOWLEDGED`, `ESCALATION_STEP_ESCALATED`, `ESCALATION_COMPLETED`, `ESCALATION_EXPIRED`.
  - [ ] Metadata per event: chain ID, step number, recipient role, notification type (tech_alert/inapp/sms/flag), timestamp, result ID (opaque). Never log the critical value itself in the audit event — it is PHI.
  - [ ] Follow existing `reportQueueAuditEvent` pattern — never throw, use `void emitClientAudit()`.

- [ ] **Task 10: SMS Integration Point** (AC: 4, 5)
  - [ ] Create `apps/lab-lite/src/lib/escalation-sms.ts`.
  - [ ] `sendCriticalValueSms(phoneNumber: string, chainId: string, analyte: string, direction: 'high' | 'low'): Promise<SmsResult>` — sends a compressed, coded SMS. Format: "CRITICAL LAB — Patient [ID-code] — [Analyte] [HIGH/LOW] — Confirm receipt by calling lab" (no raw PHI beyond what is clinically necessary).
  - [ ] If Story 49.2 (SMS Fallback) is implemented: use its SMS service. If not: queue the SMS in Dexie for manual follow-up and show "SMS queued — manual notification required" in the escalation dashboard.
  - [ ] SMS content must comply with CLAUDE.md: no PHI beyond what is clinically necessary for the critical value alert.
  - [ ] Track delivery status if available from SMS provider.

- [ ] **Task 11: Integration with Result Release Workflow** (AC: 1)
  - [ ] Hook into the result release flow (from Story 42.5). After a result is authorized and released:
    1. Call `checkResultForCriticalValues(result)`.
    2. If any critical values found, call `initiateEscalation()` for each.
    3. The `CriticalValueAlert` component listens for new escalation events and renders the full-screen alert.
  - [ ] If Story 42.5 is not yet implemented: provide a manual "Flag as Critical" action on any result in the upload history, plus unit-testable integration point.

- [ ] **Task 12: Navigation & Settings Integration** (AC: 8)
  - [ ] Add "Critical Values & Escalation" section to Settings page.
  - [ ] Sub-sections: "Thresholds" (ThresholdConfigPanel), "Escalation Contacts" (EscalationContactsPanel).
  - [ ] Route: `/[locale]/settings/critical-values` for threshold configuration.
  - [ ] Add escalation status to the dashboard sidebar or as a dedicated route: `/[locale]/escalations`.

- [ ] **Task 13: i18n — Translation Keys** (AC: 1-8)
  - [ ] Add `escalation` namespace to all locale files (`en.json`, `ar.json`, `prs.json`, `ps.json`).
  - [ ] Keys: `escalation.alert.*` (full-screen alert text, acknowledgment checkbox), `escalation.steps.*` (step type labels), `escalation.thresholds.*` (configuration labels), `escalation.contacts.*` (contact configuration), `escalation.status.*` (dashboard labels), `escalation.sms.*` (SMS template text).

- [ ] **Task 14: Tests** (AC: 1-9)
  - [ ] Unit tests for `critical-value-engine.ts`:
    - `isCriticalValue`: detects critical high, critical low, normal values, inactive thresholds, missing thresholds.
    - `checkResultForCriticalValues`: returns multiple criticals from single result, skips non-numeric fields.
  - [ ] Unit tests for `escalation-manager.ts`:
    - `initiateEscalation`: creates chain with 5 pre-computed steps, correct timing offsets.
    - `acknowledgeStep`: stops escalation on physician acknowledgment, records timestamp.
    - `advanceEscalation`: correctly advances based on elapsed time, handles app restart.
  - [ ] Unit tests for `escalation-timer.ts`:
    - Timer fires at correct intervals, advances chain, stops on acknowledgment.
    - `resumeActiveEscalations`: restores timers from Dexie state.
  - [ ] Component tests for `CriticalValueAlert.tsx`:
    - Renders full-screen modal, blocks dismissal without acknowledgment.
    - Checkbox required before button enabled.
    - Acknowledgment writes to escalation chain.
  - [ ] Component tests for `ThresholdConfigPanel.tsx`:
    - Renders all default thresholds, inline editing works, access control enforced.
  - [ ] Audit tests: assert `ESCALATION_INITIATED` and `ESCALATION_STEP_SENT` events emitted on every escalation action.
  - [ ] RTL snapshot tests for `CriticalValueAlert`, `ThresholdConfigPanel`, `EscalationStatusList`.

## Dev Notes

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/critical-value-engine.ts` | Critical value detection — pure rule-based |
| `apps/lab-lite/src/lib/escalation-manager.ts` | Escalation chain CRUD and state machine |
| `apps/lab-lite/src/lib/escalation-timer.ts` | Client-side timer for escalation advancement |
| `apps/lab-lite/src/lib/escalation-sms.ts` | SMS integration for escalation steps 3-4 |
| `apps/lab-lite/src/components/escalation/CriticalValueAlert.tsx` | Full-screen tech alert modal |
| `apps/lab-lite/src/components/escalation/ThresholdConfigPanel.tsx` | Threshold configuration UI |
| `apps/lab-lite/src/components/escalation/EscalationContactsPanel.tsx` | Escalation contact CRUD |
| `apps/lab-lite/src/components/escalation/EscalationStatusList.tsx` | Active/historical escalation dashboard |
| `apps/lab-lite/src/__tests__/critical-value-engine.test.ts` | Detection engine unit tests |
| `apps/lab-lite/src/__tests__/escalation-manager.test.ts` | Escalation manager unit tests |
| `apps/lab-lite/src/__tests__/escalation-timer.test.ts` | Timer service unit tests |
| `apps/lab-lite/src/__tests__/critical-value-alert.test.tsx` | Full-screen alert component tests |
| `apps/lab-lite/src/__tests__/threshold-config-panel.test.tsx` | Threshold config component tests |
| `apps/lab-lite/public/sounds/critical-alert.mp3` | Audio alert tone for critical value (short, attention-grabbing, royalty-free) |

### Files to Modify

| File | Change |
|------|--------|
| `apps/lab-lite/src/lib/db.ts` | Add new Dexie version with `critical_thresholds`, `escalation_chains`, `escalation_contacts` tables, seed default thresholds |
| `apps/lab-lite/src/lib/audit-client.ts` | Add `reportEscalationEvent()` function |
| `apps/lab-lite/src/components/settings/LabSettingsView.tsx` | Add "Critical Values & Escalation" section |
| `apps/lab-lite/src/components/AppSidebar.tsx` | Add "Escalations" navigation item |
| `apps/lab-lite/src/components/notifications/NotificationPanel.tsx` | Integrate critical value notifications as highest-priority items |
| `apps/lab-lite/messages/en.json` | Add `escalation.*` translation keys |
| `apps/lab-lite/messages/ar.json` | Add `escalation.*` translation keys (Arabic) |
| `apps/lab-lite/messages/prs.json` | Add `escalation.*` translation keys (Dari) |
| `apps/lab-lite/messages/ps.json` | Add `escalation.*` translation keys (Pashto) |

### Patterns to Follow

- **Deterministic rules only (AC 9):** The critical value engine uses comparison operators against configured thresholds. No ML models, no AI, no heuristics, no "smart" defaults. If a value exceeds a threshold, it is critical. Period. This is a patient safety feature — ambiguity is unacceptable.
- **Dexie versioning:** Increment version following the pattern in `db.ts`. Re-declare all existing stores.
- **Seed data on first load:** Use Dexie's `populate` hook to seed default critical thresholds. Do not overwrite user-customized values on subsequent version upgrades.
- **Audit logging (CLAUDE.md Rule #6):** Every escalation step must emit an audit event. Never log the critical value itself (PHI) — log the chain ID, step number, and recipient role only.
- **Data minimization (CLAUDE.md Rule #7):** The full-screen alert shows patient first name + age only. SMS messages use opaque patient ID codes. Escalation logs reference result IDs, not patient names.
- **i18n:** Use `useTranslations('escalation')` hook.
- **RTL:** Logical CSS properties throughout. Warning icons do NOT mirror.
- **Component library:** Use existing `@/components/ui/*` primitives.
- **SMS content (CLAUDE.md PHI rules):** SMS for critical values must contain ONLY: patient ID code (not name), analyte name, direction (high/low), and a call-to-action. No diagnosis, no exact numeric value in SMS (the physician checks in-app for details).

### Escalation State Machine

```
States: PENDING → SENT → ACKNOWLEDGED | ESCALATED

Chain lifecycle:
  1. Result released with critical value
  2. Chain created in Dexie (status: active, currentStep: 1)
  3. Step 1 fires immediately: Full-screen tech alert
     - Tech acknowledges → Step 1 status: acknowledged
     - Chain advances to Step 2
  4. Step 2 fires immediately after tech ack: In-app notification to physician
     - If physician acknowledges → Chain status: acknowledged, all remaining steps: skipped
  5. Step 3 fires at T+15 min (if no physician ack): SMS to physician
     - If physician acknowledges → Chain status: acknowledged
  6. Step 4 fires at T+30 min (if no physician ack): SMS to medical director
     - If medical director acknowledges → Chain status: acknowledged
  7. Step 5 fires at T+60 min (if no ack): Flag to district health officer
     - Chain status: expired (maximum escalation reached)

Timer resolution: 1-minute intervals (acceptable latency for SMS)
Persistence: Chain state in Dexie survives app restart
```

### Timing Diagram

```
T+0          T+15         T+30         T+60
|            |            |            |
v            v            v            v
[Tech Alert] [SMS→Doc]    [SMS→Dir]    [Flag→District]
    |
    +→[InApp→Doc]
       (after tech ack)

Each step checks: has physician acknowledged?
  YES → stop chain, mark acknowledged
  NO  → execute step, continue timer
```

### Pitfalls

- **App restart mid-escalation:** The timer is a JavaScript `setInterval` — it dies with the tab. On app startup, `resumeActiveEscalations()` must query Dexie for active chains and restart timers. It must also check if any steps were missed during downtime and execute them immediately.
- **Multiple critical values in one result:** A single lab result (e.g., Basic Metabolic Panel) can have multiple critical values (e.g., Potassium AND Glucose). Each critical value should trigger its own escalation chain. The full-screen alert should show all critical values from the same result simultaneously.
- **Race condition on acknowledgment:** If a physician acknowledges via OPD-Lite in-app notification at T+14:59, the SMS at T+15:00 might already be queued. Use a "check before send" pattern: re-query chain status immediately before executing each step.
- **Audio alert browser restrictions:** Browsers block autoplay audio without user interaction. The full-screen alert may need a "Enable Sound" button on first occurrence. After first interaction, subsequent alerts can autoplay.
- **SMS service unavailability:** If the SMS service (Story 49.2) is not available, the escalation must not silently skip the step. It must show "SMS delivery failed — manual notification required" and log the failure in the audit trail.
- **Threshold validation:** Critical low must be less than critical high for the same analyte. The configuration UI must validate this. Also guard against negative thresholds where clinically inappropriate.
- **Focus trap accessibility:** The full-screen alert uses a focus trap (no interaction with underlying app). Ensure the trap is keyboard-accessible: Tab cycles through checkbox and button only. Screen reader announces the critical value alert.
- **Test overlap with Story 42.5:** The integration point with result authorization (Task 11) depends on Story 42.5. If 42.5 is not implemented, provide a standalone trigger function and manual UI action for testing.

### Project Structure Notes

- Lab-Lite is a Next.js 15 PWA at `apps/lab-lite/`.
- Uses `next-intl` for i18n with locale files in `apps/lab-lite/messages/`.
- Dexie (IndexedDB wrapper) for offline storage at `apps/lab-lite/src/lib/db.ts`.
- Audit events via `@ultranos/audit-logger` client adapter at `apps/lab-lite/src/lib/audit-client.ts`.
- HLC timestamps via `@ultranos/sync-engine` at `apps/lab-lite/src/lib/hlc.ts`.
- Notification components at `apps/lab-lite/src/components/notifications/`.
- Settings at `apps/lab-lite/src/components/settings/LabSettingsView.tsx`.
- Auth session store at `apps/lab-lite/src/stores/auth-session-store.ts`.
- Existing UI components at `apps/lab-lite/src/components/ui/`.
- LOINC categories at `apps/lab-lite/src/lib/loinc-categories.ts`.

### References

- Epic 48 acceptance criteria: `_bmad-output/planning-artifacts/epics.md` (line 6137)
- Story 49.2 (SMS Fallback — integration): `_bmad-output/planning-artifacts/epics.md` (line 6173)
- Story 42.4 (Result templates — result structure): `_bmad-output/planning-artifacts/epics.md`
- Story 42.5 (Result authorization — integration point): `_bmad-output/planning-artifacts/epics.md`
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Audit client pattern: `apps/lab-lite/src/lib/audit-client.ts`
- HLC singleton: `apps/lab-lite/src/lib/hlc.ts`
- Notification components: `apps/lab-lite/src/components/notifications/`
- CLAUDE.md Rule #6: Audit every PHI access
- CLAUDE.md Rule #7: Lab portal data minimization (first name + age only)
- CLAUDE.md: PHI must never appear in logs (Rule #1)
