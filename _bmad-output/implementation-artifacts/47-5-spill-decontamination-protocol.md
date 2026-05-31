# Story 47.5: Spill & Decontamination Protocol

Status: ready-for-dev

## Story

As a lab technician alone during a spill,
I want a risk-tiered guided response,
so that I decontaminate correctly without needing to call someone for instructions.

## Acceptance Criteria

1. **Given** a spill occurs, **when** the tech taps the "Spill" emergency button (accessible from Story 47.1's emergency menu), **then** the system asks: "What spilled?" with options: Blood/Serum, Urine, Chemical/Reagent, Culture/Microbiology.
2. **And** each selection triggers the appropriate risk-tiered protocol with: PPE requirements, decontamination agent, contact time, area clearance time, and disposal method.
3. **And** a microbiology culture spill triggers a more aggressive protocol than a urine spill (risk-tiered severity).
4. **And** the protocol is displayed as a step-by-step guided workflow with confirmation at each step.
5. **And** the event is logged as an incident with decontamination actions taken.
6. **And** the entire workflow works fully offline.
7. **And** all actions are audit-logged.

## Tasks / Subtasks

- [ ] **Task 1: Spill protocol type definitions** (AC: 1, 2)
  - [ ] 1.1 Create `apps/lab-lite/src/types/spill-protocol.ts` with:
    - `SpillType` enum: `BLOOD_SERUM`, `URINE`, `CHEMICAL_REAGENT`, `CULTURE_MICROBIOLOGY`.
    - `RiskTier` enum: `LOW` (urine), `MODERATE` (blood/serum), `HIGH` (chemical), `CRITICAL` (culture/microbiology).
    - `PpeRequirement` type: `{ item: string; required: boolean; notes?: string }`.
    - `DecontaminationStep` interface: `{ order: number; instruction: string; contactTimeMinutes: number | null; agentName: string | null; notes: string | null }`.
    - `SpillProtocol` interface: `{ spillType: SpillType; riskTier: RiskTier; ppe: PpeRequirement[]; steps: DecontaminationStep[]; clearanceTimeMinutes: number; disposalMethod: string; additionalWarnings: string[] }`.
    - `SpillIncident` interface: `{ id: string; spillType: SpillType; riskTier: RiskTier; occurredAt: string; location: string; stepsCompleted: number[]; completedAt: string | null; techId: string; notes: string; hlcTimestamp: string }`.

- [ ] **Task 2: Spill protocol data (static, offline-bundled)** (AC: 2, 3, 6)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/safety/spill-protocols.ts`.
  - [ ] 2.2 Define `getSpillProtocol(spillType: SpillType): SpillProtocol` — returns the complete protocol for each spill type.
  - [ ] 2.3 **Blood/Serum protocol** (MODERATE risk):
    - PPE: gloves (required), gown (required), face shield if splash risk (conditional).
    - Steps: (1) Don PPE, (2) Cover spill with absorbent material, (3) Apply 10% bleach solution (1:10 dilution), (4) Wait 10 minutes contact time, (5) Clean from perimeter inward, (6) Dispose of contaminated materials in infectious waste, (7) Clean surface with detergent, (8) Remove PPE and wash hands.
    - Clearance: 15 minutes. Disposal: infectious waste bin.
  - [ ] 2.4 **Urine protocol** (LOW risk):
    - PPE: gloves (required).
    - Steps: (1) Don gloves, (2) Absorb with paper towels, (3) Clean surface with detergent, (4) Apply disinfectant, (5) Wait 5 minutes, (6) Wipe clean, (7) Dispose in regular biohazard waste, (8) Remove gloves and wash hands.
    - Clearance: 10 minutes. Disposal: biohazard waste.
  - [ ] 2.5 **Chemical/Reagent protocol** (HIGH risk):
    - PPE: gloves (required), gown (required), face shield (required), respiratory protection if volatile (conditional).
    - Steps: (1) Evacuate immediate area if volatile/fuming, (2) Don full PPE, (3) Identify the chemical (check SDS if available), (4) Use appropriate neutralizing agent or absorbent (NOT bleach for chemicals), (5) Wait per SDS contact time, (6) Clean from perimeter inward, (7) Dispose as chemical waste (NOT infectious waste), (8) Ventilate area, (9) Remove PPE and wash hands.
    - Clearance: 30 minutes. Disposal: chemical waste container.
    - Warning: "DO NOT use bleach on chemical spills — it may create toxic gas."
  - [ ] 2.6 **Culture/Microbiology protocol** (CRITICAL risk):
    - PPE: double gloves (required), gown (required), N95 mask (required), face shield (required).
    - Steps: (1) Evacuate area — do NOT touch the spill, (2) Close doors/windows to contain aerosol, (3) Wait 30 minutes for aerosol to settle, (4) Don full PPE including N95, (5) Cover spill with paper towels, (6) Apply concentrated disinfectant (undiluted bleach or appropriate sporicide), (7) Wait 30 minutes contact time, (8) Clean from perimeter inward, (9) Dispose ALL materials in autoclave bag, (10) Autoclave contaminated waste, (11) Remove PPE in correct order (gloves last), (12) Wash hands thoroughly.
    - Clearance: 60 minutes. Disposal: autoclave bag -> autoclave.
    - Warning: "Microbiology spills may generate infectious aerosols. Wait 30 minutes before approaching."

- [ ] **Task 3: Dexie schema migration** (AC: 5)
  - [ ] 3.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with table:
    - `spill_incidents`: `&id, spillType, riskTier, occurredAt, techId`
  - [ ] 3.2 Add typed `Dexie.Table` property and CRUD helpers.

- [ ] **Task 4: Spill incident logging service** (AC: 5)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/safety/spill-service.ts`.
  - [ ] 4.2 `startSpillIncident(input: { spillType: SpillType; location: string }): Promise<SpillIncident>` — creates incident record in Dexie, emits audit event.
  - [ ] 4.3 `completeStep(incidentId: string, stepNumber: number): Promise<void>` — records step completion.
  - [ ] 4.4 `completeSpillIncident(incidentId: string, notes: string): Promise<void>` — marks incident as complete, queues sync, emits audit event.
  - [ ] 4.5 Queue completed incidents for sync to Hub via `syncQueue`.

- [ ] **Task 5: Spill type selection UI** (AC: 1)
  - [ ] 5.1 Create `apps/lab-lite/src/components/safety/SpillTypeSelector.tsx`.
  - [ ] 5.2 Four large, color-coded buttons — one per spill type. Colors match risk tier: blue (urine/LOW), amber (blood/MODERATE), orange (chemical/HIGH), red (culture/CRITICAL).
  - [ ] 5.3 Each button shows the spill type name and a brief risk label.
  - [ ] 5.4 Accessible from Story 47.1's emergency action menu ("Spill Emergency" option).
  - [ ] 5.5 Can also be accessed directly from a safety menu/page route.

- [ ] **Task 6: Guided spill response workflow UI** (AC: 2, 3, 4)
  - [ ] 6.1 Create `apps/lab-lite/src/components/safety/SpillResponseWorkflow.tsx`.
  - [ ] 6.2 Full-screen step-by-step workflow (same emergency UI design principles as Story 47.1).
  - [ ] 6.3 Header: spill type badge with risk tier color, location.
  - [ ] 6.4 PPE checklist: displayed first as a pre-step. Tech confirms each PPE item is donned before proceeding.
  - [ ] 6.5 Steps: large text, one step per screen, "Done" confirmation button. Steps with contact times show a countdown timer.
  - [ ] 6.6 Contact time countdown: optional timer that counts down the required wait time. Visual indicator (progress ring). Audio alert when time is complete (if device supports).
  - [ ] 6.7 Warnings displayed in red alert boxes at the top of relevant steps (e.g., "DO NOT use bleach" for chemical spills).
  - [ ] 6.8 On final step completion: prompt for notes (optional free text), then complete the incident.
  - [ ] 6.9 Large touch targets (min 48px), high contrast, no animations that delay information.
  - [ ] 6.10 RTL support: logical CSS properties throughout.

- [ ] **Task 7: Spill incident history view** (AC: 5)
  - [ ] 7.1 Create `apps/lab-lite/src/components/safety/SpillHistoryView.tsx`.
  - [ ] 7.2 List of past spill incidents: date, type, risk tier, location, completion status.
  - [ ] 7.3 Tap to view incident details: all steps completed, timestamps, notes.
  - [ ] 7.4 Feeds into inspection readiness documentation.

- [ ] **Task 8: Audit event integration** (AC: 7)
  - [ ] 8.1 Add spill protocol audit events to `apps/lab-lite/src/lib/audit-client.ts`:
    - `SPILL_PROTOCOL_STARTED`: action CREATE.
    - `SPILL_STEP_COMPLETED`: action UPDATE.
    - `SPILL_PROTOCOL_COMPLETED`: action UPDATE.
  - [ ] 8.2 Metadata includes: `incidentId`, `spillType`, `riskTier`, `location`, `actorId`. No PHI in spill audit events.

- [ ] **Task 9: i18n translation keys** (AC: all)
  - [ ] 9.1 Add `safety.spill.*` keys to all locale JSON files.
  - [ ] 9.2 Keys include: spill types, risk tier labels, PPE items, all decontamination step instructions, warnings, contact times, timer labels.
  - [ ] 9.3 Decontamination instructions must be accurate in all supported languages — these are safety-critical translations.

- [ ] **Task 10: Tests** (AC: all)
  - [ ] 10.1 Unit tests for `spill-protocols.ts`: each spill type returns correct protocol, culture protocol is highest risk, chemical protocol warns against bleach.
  - [ ] 10.2 Unit tests for `spill-service.ts`: incident creation, step completion tracking, incident completion and sync queueing.
  - [ ] 10.3 Component tests for `SpillTypeSelector`: renders all 4 types with correct risk colors, RTL layout snapshot.
  - [ ] 10.4 Component tests for `SpillResponseWorkflow`: step navigation, PPE checklist enforcement, contact time countdown display, warnings shown for chemical/culture types, RTL layout snapshot.
  - [ ] 10.5 Integration test: full spill response from type selection through all steps to completion and Dexie persistence.
  - [ ] 10.6 Offline test: entire workflow completes with no network connectivity.

## Dev Notes

### Risk-Tiered Protocol Design

The four spill types map to escalating risk tiers that determine the aggressiveness of the response:

| Spill Type | Risk Tier | PPE Level | Contact Time | Clearance | Key Danger |
|---|---|---|---|---|---|
| Urine | LOW | Gloves only | 5 min | 10 min | Minimal biohazard |
| Blood/Serum | MODERATE | Gloves + Gown | 10 min | 15 min | Bloodborne pathogen exposure |
| Chemical/Reagent | HIGH | Full PPE + respiratory | Per SDS | 30 min | Toxic fumes, chemical burns |
| Culture/Microbiology | CRITICAL | Double gloves + N95 + full PPE | 30 min | 60 min | Infectious aerosol generation |

The culture/microbiology protocol is intentionally the most aggressive — a dropped culture plate can generate infectious aerosols that remain suspended for 30+ minutes. The "wait 30 minutes before approaching" step is a critical safety measure.

### Emergency UI Design Principles

Same principles as Story 47.1 — this is an emergency UI:
- Large touch targets (min 48px)
- Large text (min 18px body, 24px headings)
- High contrast (dark text on light backgrounds)
- One step per screen (reduce cognitive load)
- No animations that delay information
- Red alert boxes for critical warnings

### Contact Time Countdown Timer

For steps with mandatory wait times, the UI shows an optional countdown timer:
- Implemented as a `CountdownTimer` component
- Visual: circular progress ring that depletes over time
- Audio: device notification sound when complete (using `Notification API` or `Audio API`)
- The timer is optional — the tech can skip it if they're confident about timing
- Timer state persists in component state (not Dexie — no need to persist a running timer)

### Integration with Story 47.1

The spill protocol is accessible from the Emergency Action Menu (Story 47.1). When the tech taps "Spill Emergency" in the emergency menu, they are routed to the `SpillTypeSelector`. This is a navigation link, not a component dependency — the spill workflow is self-contained.

If Story 47.1 is not yet implemented, the spill protocol is still accessible from a dedicated safety route (e.g., `/[locale]/safety/spill`).

### Offline Guarantee

All spill protocol data is statically bundled in `spill-protocols.ts`. No network calls are needed:
- Protocol steps: static data
- Incident logging: Dexie persistence
- Timer: browser-local
- Sync: queued for later delivery

## Project Structure Notes

### New Files

| File | Purpose |
|---|---|
| `src/types/spill-protocol.ts` | Type definitions for spill types, protocols, incidents |
| `src/lib/safety/spill-protocols.ts` | Static protocol data for each spill type |
| `src/lib/safety/spill-service.ts` | Incident CRUD and step tracking |
| `src/components/safety/SpillTypeSelector.tsx` | Spill type selection UI |
| `src/components/safety/SpillResponseWorkflow.tsx` | Guided step-by-step response workflow |
| `src/components/safety/SpillHistoryView.tsx` | Past spill incident list |
| `src/components/safety/CountdownTimer.tsx` | Reusable countdown timer for contact times |

### Modified Files

| File | Change |
|---|---|
| `src/lib/db.ts` | Add Dexie version with `spill_incidents` table |
| `src/lib/audit-client.ts` | Add spill protocol audit event helpers |
| `src/i18n/messages/*.json` | Add `safety.spill.*` translation keys |

### Dependencies on Other Stories

- **Story 47.1** (Post-Exposure Protocol): Emergency Action Menu provides access to spill workflow. Navigation link only — no code dependency.
- **Story 47.7** (Infection Control Self-Audit): Spill incident history feeds into inspection readiness documentation.

## References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` (Epic 47, Story 47.5)
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Audit client pattern: `apps/lab-lite/src/lib/audit-client.ts`
- WHO Laboratory Biosafety Manual (reference for decontamination protocols)
- CDC BMBL (Biosafety in Microbiological and Biomedical Laboratories) — spill cleanup procedures
- CLAUDE.md: No PHI involved in spill protocols
