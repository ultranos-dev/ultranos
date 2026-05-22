# Navigation Phase 4: OPD-Lite Appointment Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete appointment scheduling system for OPD-Lite including FHIR R4 types, offline-first IndexedDB storage, daily/weekly schedule views, walk-in queue management, booking flow, Hub API endpoints, and sync integration.

**Architecture:** FHIR R4 Appointment + Slot Zod schemas in `shared-types`. Local Dexie store in OPD-Lite with encryption for patient-referencing fields. Hub API tRPC router for CRUD + batch sync. Appointments are Tier 3 (LWW) for conflict resolution; walk-in queue positions use Tier 4 (HLC replay). Sync priority level 5 (between observations and patient demographics).

**Tech Stack:** Zod, TypeScript, Dexie.js, tRPC, Next.js 15, Vitest, next-intl, Supabase (Postgres), `@ultranos/audit-logger`

**Stories covered:** 37.11–37.19

---

## File Structure

### New Files (shared-types)
- `packages/shared-types/src/fhir/appointment.schema.ts` — FHIR R4 Appointment + Slot Zod schemas

### New Files (OPD-Lite)
- `apps/opd-lite/src/stores/appointment-store.ts` — Zustand store for appointment state
- `apps/opd-lite/src/app/[locale]/appointments/page.tsx` — Appointments page route
- `apps/opd-lite/src/components/appointments/DayScheduleView.tsx` — Daily schedule grid
- `apps/opd-lite/src/components/appointments/WeekScheduleView.tsx` — Weekly overview
- `apps/opd-lite/src/components/appointments/WalkInQueue.tsx` — Walk-in queue section
- `apps/opd-lite/src/components/appointments/BookingModal.tsx` — Book appointment modal
- `apps/opd-lite/src/components/appointments/AppointmentSlot.tsx` — Single slot card
- `apps/opd-lite/src/components/appointments/PatientSummaryPopup.tsx` — Patient quick-view on slot click
- `apps/opd-lite/src/hooks/useAppointments.ts` — Hook for reading/writing appointments from Dexie
- `apps/opd-lite/src/__tests__/appointments.test.tsx` — Tests

### New Files (Hub API)
- `apps/hub-api/src/trpc/routers/appointment.ts` — tRPC router for appointment CRUD + sync

### Modified Files
- `packages/shared-types/src/index.ts` — Export appointment schemas
- `packages/sync-engine/src/sync-priority.ts` — Add Appointment priority
- `apps/opd-lite/src/lib/db.ts` — Add appointments + slots tables
- `apps/opd-lite/messages/en.json` — Add appointments.* i18n keys
- `apps/opd-lite/messages/ar.json` — Same
- `apps/opd-lite/messages/prs.json` — Same
- `apps/opd-lite/src/hooks/useNavBadges.ts` — Add today's appointment count
- `apps/opd-lite/src/components/AppSidebar.tsx` — Wire appointment badge
- `apps/hub-api/src/trpc/routers/_app.ts` — Register appointment router

---

## Task 1: FHIR R4 Appointment & Slot Schemas + Sync Priority

**Files:**
- Create: `packages/shared-types/src/fhir/appointment.schema.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/sync-engine/src/sync-priority.ts`

- [ ] **Step 1: Read existing patterns**

Read these files to understand exact patterns:
- `packages/shared-types/src/fhir/encounter.schema.ts` — FHIR schema pattern
- `packages/shared-types/src/fhir/common.schema.ts` — shared building blocks (CodingSchema, ReferenceSchema, FhirMetaSchema, FhirDateTimeOrDateSchema)
- `packages/sync-engine/src/sync-priority.ts` — priority map

- [ ] **Step 2: Create appointment.schema.ts**

Create `packages/shared-types/src/fhir/appointment.schema.ts`:

```typescript
import { z } from 'zod'
import {
  CodeableConceptSchema,
  ReferenceSchema,
  FhirMetaSchema,
  FhirDateTimeOrDateSchema,
} from './common.schema.js'

// FHIR R4 Appointment Zod Schema
// Ref: https://hl7.org/fhir/R4/appointment.html

export const AppointmentStatusSchema = z.enum([
  'proposed',
  'pending',
  'booked',
  'arrived',
  'fulfilled',
  'cancelled',
  'noshow',
  'entered-in-error',
])

export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>

export const AppointmentServiceTypeSchema = z.enum([
  'new-consult',
  'follow-up',
  'urgent',
  'walk-in',
])

export type AppointmentServiceType = z.infer<typeof AppointmentServiceTypeSchema>

const AppointmentParticipantStatusSchema = z.enum([
  'accepted',
  'declined',
  'tentative',
  'needs-action',
])

const AppointmentParticipantSchema = z.object({
  actor: ReferenceSchema,
  status: AppointmentParticipantStatusSchema,
  type: z.array(CodeableConceptSchema).optional(),
})

export const FhirAppointmentSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Appointment'),
  status: AppointmentStatusSchema,
  serviceType: z.array(z.object({
    coding: z.array(z.object({
      system: z.string().optional(),
      code: AppointmentServiceTypeSchema,
      display: z.string().optional(),
    })),
  })).optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  participant: z.array(AppointmentParticipantSchema),
  description: z.string().optional(),
  _ultranos: z.object({
    walkIn: z.boolean().default(false),
    queuePosition: z.number().int().nullable().default(null),
    isOfflineCreated: z.boolean(),
    hlcTimestamp: z.string(),
    createdAt: z.string().datetime(),
    clinicId: z.string().optional(),
  }),
  meta: FhirMetaSchema,
})

export type FhirAppointmentZod = z.infer<typeof FhirAppointmentSchema>

// FHIR R4 Slot Zod Schema
// Ref: https://hl7.org/fhir/R4/slot.html

export const SlotStatusSchema = z.enum([
  'free',
  'busy',
  'busy-unavailable',
  'busy-tentative',
  'entered-in-error',
])

export type SlotStatus = z.infer<typeof SlotStatusSchema>

export const FhirSlotSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('Slot'),
  schedule: ReferenceSchema, // Reference to practitioner
  status: SlotStatusSchema,
  start: z.string().datetime(),
  end: z.string().datetime(),
  _ultranos: z.object({
    slotDurationMinutes: z.number().int().positive(),
    hlcTimestamp: z.string(),
  }),
  meta: FhirMetaSchema,
})

export type FhirSlotZod = z.infer<typeof FhirSlotSchema>
```

- [ ] **Step 3: Export from shared-types index**

Add to `packages/shared-types/src/index.ts`:
```typescript
export * from './fhir/appointment.schema.js'
```

- [ ] **Step 4: Add sync priority**

Add to `packages/sync-engine/src/sync-priority.ts` SYNC_PRIORITY object:
```typescript
Appointment: 5, // Below clinical data, above patient demographics
Slot: 5,
```

- [ ] **Step 5: Run tests and build**

```bash
pnpm -F @ultranos/shared-types build
pnpm -F @ultranos/shared-types test
pnpm -F sync-engine build
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/fhir/appointment.schema.ts packages/shared-types/src/index.ts packages/sync-engine/src/sync-priority.ts
git commit -m "feat(shared-types): add FHIR R4 Appointment and Slot Zod schemas

Appointment schema with status lifecycle, service types (new-consult,
follow-up, urgent, walk-in), participant references, and _ultranos
extensions for walk-in queue position and HLC timestamps. Slot schema
for time slot management. Sync priority level 5.

Refs: Epic 37, Story 37.11"
```

---

## Task 2: OPD-Lite Appointment i18n Keys + Dexie Store

**Files:**
- Modify: `apps/opd-lite/messages/{en,ar,prs}.json`
- Modify: `apps/opd-lite/src/lib/db.ts`

- [ ] **Step 1: Add appointments i18n keys to all locale files**

Add `appointments` namespace to `en.json`:
```json
"appointments": {
  "title": "Appointments",
  "today": "Today",
  "dayView": "Day",
  "weekView": "Week",
  "datePicker": "Select date",
  "previousDay": "Previous day",
  "nextDay": "Next day",
  "previousWeek": "Previous week",
  "nextWeek": "Next week",
  "available": "Available",
  "booked": "Booked",
  "checkedIn": "Checked In",
  "inProgress": "In Progress",
  "completed": "Completed",
  "noShow": "No Show",
  "cancelled": "Cancelled",
  "newConsult": "New Consult",
  "followUp": "Follow-up",
  "urgent": "Urgent",
  "walkIn": "Walk-in",
  "bookAppointment": "Book Appointment",
  "addWalkIn": "Add Walk-In",
  "startEncounter": "Start Encounter",
  "changeStatus": "Change Status",
  "walkInQueue": "Walk-In Queue",
  "queueNumber": "#{number}",
  "waitTime": "{minutes}m waiting",
  "patient": "Patient",
  "type": "Type",
  "time": "Time",
  "selectPatient": "Select patient",
  "selectDate": "Select date",
  "selectTime": "Select time slot",
  "appointmentType": "Appointment type",
  "notes": "Notes (optional)",
  "confirmBooking": "Confirm Booking",
  "cancelAppointment": "Cancel Appointment",
  "slotTaken": "This slot has been taken",
  "noAppointments": "No appointments scheduled",
  "noWalkIns": "No walk-in patients",
  "schedulingConflict": "Scheduling conflict detected — please review",
  "doubleBookWarning": "Double-booking detected for this time slot"
}
```

Add Arabic and Dari translations in `ar.json` and `prs.json` respectively.

- [ ] **Step 2: Add appointments and slots tables to Dexie**

Read `apps/opd-lite/src/lib/db.ts`. Find the latest version number (currently v17). Add a new version (v18) with two new tables:

```typescript
// In the constructor, after the last this.version() call:
this.version(18).stores({
  appointments: 'id, status, start, [participant.0.actor.reference], _ultranos.hlcTimestamp',
  slots: 'id, status, start, [schedule.reference], _ultranos.hlcTimestamp',
})
```

Add table declarations in the class:
```typescript
appointments!: EntityTable<FhirAppointmentZod, 'id'>
slots!: EntityTable<FhirSlotZod, 'id'>
```

Add to PHI_TABLE_CONFIGS (appointments reference patients):
```typescript
{
  tableName: 'appointments',
  indexedFields: ['id', 'status', 'start', 'participant.0.actor.reference', '_ultranos.hlcTimestamp'],
},
```

Slots do NOT need encryption (they only reference practitioners, not patients).

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/messages/ apps/opd-lite/src/lib/db.ts
git commit -m "feat(opd-lite): add appointment i18n keys and Dexie tables

Appointment and slot tables with encryption for patient-referencing
fields. Full i18n coverage for schedule views, booking, walk-in
queue, and status labels in en/ar/prs.

Refs: Epic 37, Story 37.12"
```

---

## Task 3: useAppointments Hook + Appointment Store

**Files:**
- Create: `apps/opd-lite/src/hooks/useAppointments.ts`
- Create: `apps/opd-lite/src/stores/appointment-store.ts`

- [ ] **Step 1: Create Zustand appointment store**

Create `apps/opd-lite/src/stores/appointment-store.ts`:
- Holds `selectedDate: Date` (default today)
- Holds `viewMode: 'day' | 'week'` (default 'day')
- Actions: `setSelectedDate`, `setViewMode`, `nextDay`, `prevDay`, `nextWeek`, `prevWeek`

- [ ] **Step 2: Create useAppointments hook**

Create `apps/opd-lite/src/hooks/useAppointments.ts`:
- Reads appointments from Dexie for the selected date range
- Provides `createAppointment`, `updateStatus`, `cancelAppointment` mutations
- Each mutation writes to Dexie + stamps HLC timestamp
- `createAppointment` checks for double-booking (slot status = busy → reject with warning)
- For walk-ins: auto-assigns next queue position
- Returns `{ appointments, slots, loading, createAppointment, updateStatus, cancelAppointment, addWalkIn }`

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/stores/appointment-store.ts apps/opd-lite/src/hooks/useAppointments.ts
git commit -m "feat(opd-lite): add appointment store and useAppointments hook

Zustand store for date/view state. Hook provides CRUD operations
against Dexie with HLC timestamps, double-booking detection, and
walk-in queue position auto-assignment.

Refs: Epic 37, Story 37.12"
```

---

## Task 4: Daily Schedule View + Appointments Page

**Files:**
- Create: `apps/opd-lite/src/app/[locale]/appointments/page.tsx`
- Create: `apps/opd-lite/src/components/appointments/DayScheduleView.tsx`
- Create: `apps/opd-lite/src/components/appointments/AppointmentSlot.tsx`
- Create: `apps/opd-lite/src/components/appointments/PatientSummaryPopup.tsx`

- [ ] **Step 1: Create AppointmentSlot component**

A card showing a single time slot: time, patient name (or "Available"), appointment type badge, status badge. Click handler opens PatientSummaryPopup or BookingModal.

- [ ] **Step 2: Create PatientSummaryPopup component**

Shows on occupied slot click: patient name, age, allergy status (red if present per safety rule 4), appointment type, two buttons: "Start Encounter" (navigates to `/encounter/[patientId]`) and "Change Status" (dropdown for status transitions).

- [ ] **Step 3: Create DayScheduleView component**

Time-slot grid from 08:00–17:00 (configurable). Uses `useAppointments` hook. Each row is an `AppointmentSlot`. Date navigation arrows (previous/next day) + date picker. Renders `WalkInQueue` section below the grid (placeholder div for now).

- [ ] **Step 4: Create appointments page**

Route page wrapping DayScheduleView with AuthGuard, Day/Week toggle, and title.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/app/\[locale\]/appointments/ apps/opd-lite/src/components/appointments/
git commit -m "feat(opd-lite): add daily schedule view for appointments

Time-slot grid with appointment cards, patient summary popup,
status transitions, and date navigation. Configurable clinic hours.

Refs: Epic 37, Story 37.13"
```

---

## Task 5: Walk-In Queue + Booking Modal

**Files:**
- Create: `apps/opd-lite/src/components/appointments/WalkInQueue.tsx`
- Create: `apps/opd-lite/src/components/appointments/BookingModal.tsx`

- [ ] **Step 1: Create WalkInQueue component**

Shows today's walk-in patients ordered by queue position. Each row: queue number, patient name, wait time, urgency badge, status. "Add Walk-In" button opens a modal with patient search + type selector. Uses `useAppointments().addWalkIn`.

- [ ] **Step 2: Create BookingModal component**

Modal with: patient search (reuse `SearchInput`), date picker (pre-filled), available slots dropdown, appointment type selector, optional notes field. "Confirm Booking" calls `useAppointments().createAppointment`. Shows allergy banner if patient has allergies. Double-booking warning if slot is busy.

- [ ] **Step 3: Wire WalkInQueue into DayScheduleView**

Replace the placeholder div in DayScheduleView with the actual `<WalkInQueue />` component.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/appointments/WalkInQueue.tsx apps/opd-lite/src/components/appointments/BookingModal.tsx apps/opd-lite/src/components/appointments/DayScheduleView.tsx
git commit -m "feat(opd-lite): add walk-in queue and booking modal

Walk-in queue with queue position, wait time, urgency badges.
Booking modal with patient search, slot selection, allergy display,
and double-booking prevention.

Refs: Epic 37, Stories 37.14, 37.15"
```

---

## Task 6: Weekly Schedule View

**Files:**
- Create: `apps/opd-lite/src/components/appointments/WeekScheduleView.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/appointments/page.tsx`

- [ ] **Step 1: Create WeekScheduleView component**

7-day grid (Saturday–Friday for MENA, configurable via `NEXT_PUBLIC_WEEK_START` env var). Each cell shows appointment count color-coded by type. Click day header → navigate to that day's view. Click cell → open BookingModal. Today's column highlighted. Week navigation arrows.

Responsive: < 1024px stacks to single-day list with swipe. RTL-safe (days flow right-to-left).

- [ ] **Step 2: Wire into appointments page**

Update the page to toggle between DayScheduleView and WeekScheduleView based on appointment store `viewMode`.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/appointments/WeekScheduleView.tsx apps/opd-lite/src/app/\[locale\]/appointments/page.tsx
git commit -m "feat(opd-lite): add weekly schedule view

7-day grid with appointment counts, color-coded by type. Saturday-
Friday default for MENA locale (configurable). Responsive stacking
below 1024px. RTL-safe day ordering.

Refs: Epic 37, Story 37.16"
```

---

## Task 7: Hub API Appointment Router

**Files:**
- Create: `apps/hub-api/src/trpc/routers/appointment.ts`
- Modify: `apps/hub-api/src/trpc/routers/_app.ts`

- [ ] **Step 1: Read existing router patterns**

Read `apps/hub-api/src/trpc/routers/consent.ts` and `apps/hub-api/src/trpc/routers/_app.ts` for exact patterns.

- [ ] **Step 2: Create appointment router**

Create `apps/hub-api/src/trpc/routers/appointment.ts` with these procedures:

1. `appointment.listByPractitioner` — query, paginated, date range filter
2. `appointment.listByPatient` — query, returns appointments for a patient
3. `appointment.create` — mutation, creates appointment + updates slot, validates no double-booking
4. `appointment.updateStatus` — mutation, status transitions (booked→arrived→fulfilled, booked→cancelled)
5. `appointment.syncBatch` — mutation, accepts offline-created batch with HLC timestamps, applies Tier 3 LWW, flags double-booking conflicts
6. `slot.listByPractitioner` — query, returns slots for a date
7. `slot.generateDaily` — mutation, creates slot entries for a practitioner's working day

All endpoints enforce RBAC (practitioner + ADMIN only), emit audit events, return opaque patient refs (not demographics).

- [ ] **Step 3: Register in _app.ts**

Add `appointment: appointmentRouter` to the appRouter.

- [ ] **Step 4: Commit**

```bash
git add apps/hub-api/src/trpc/routers/appointment.ts apps/hub-api/src/trpc/routers/_app.ts
git commit -m "feat(hub-api): add appointment CRUD and sync endpoints

7 tRPC procedures for appointment management: list by practitioner/
patient, create with double-booking validation, status transitions,
batch sync with Tier 3 LWW resolution, slot listing, and daily slot
generation. RBAC enforced, audit events emitted.

Refs: Epic 37, Story 37.17"
```

---

## Task 8: Appointment Sync + Sidebar Badge

**Files:**
- Modify: `apps/opd-lite/src/hooks/useAppointments.ts`
- Modify: `apps/opd-lite/src/hooks/useNavBadges.ts`
- Modify: `apps/opd-lite/src/components/AppSidebar.tsx`

- [ ] **Step 1: Add sync logic to useAppointments**

Add a `syncAppointments` function that:
- Collects locally modified appointments (by HLC timestamp comparison)
- Calls `appointment.syncBatch` on the Hub API
- Merges response back into Dexie (Hub is authoritative for non-conflicting items)
- Surfaces conflicts as warnings in the return value
- Runs on mount and on a 60-second interval

- [ ] **Step 2: Add appointment count to useNavBadges**

Query Dexie for today's non-cancelled appointment count. Add to the NavBadges interface as `todayAppointments: number`.

- [ ] **Step 3: Wire badge in AppSidebar**

Add `badge: badges.todayAppointments` to the Appointments nav item in AppSidebar.tsx. Only show when count > 0.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/hooks/useAppointments.ts apps/opd-lite/src/hooks/useNavBadges.ts apps/opd-lite/src/components/AppSidebar.tsx
git commit -m "feat(opd-lite): add appointment sync and sidebar badge

Sync locally modified appointments to Hub API on 60s interval.
Sidebar badge shows today's appointment count. Conflicts surfaced
as warnings on the schedule view.

Refs: Epic 37, Stories 37.18, 37.19"
```

---

## Task 9: Tests

**Files:**
- Create: `apps/opd-lite/src/__tests__/appointments.test.tsx`

- [ ] **Step 1: Write appointment tests**

Test cases:
1. DayScheduleView renders time slots for a day
2. Available slot shows "Available" label
3. Booked slot shows patient name and type badge
4. Clicking available slot opens BookingModal
5. BookingModal creates appointment on confirm
6. Walk-in queue renders ordered by queue position
7. Urgent walk-ins display red badge
8. Double-booking shows warning message
9. Status change updates appointment in store
10. Allergy flag shows red in PatientSummaryPopup

Mock Dexie db with test appointment/slot data.

- [ ] **Step 2: Run tests**

```bash
cd apps/opd-lite && pnpm test -- --run src/__tests__/appointments.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/__tests__/appointments.test.tsx
git commit -m "test(opd-lite): add appointment scheduling tests

10 tests covering day view, booking, walk-in queue, double-booking
prevention, status transitions, and allergy display.

Refs: Epic 37, Stories 37.13-37.15"
```
