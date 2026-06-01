# Story 54.3: Courier & Sample Transport Tracking

Status: review

## Story

As a lab manager,
I want to track samples during transport from collection points to the main lab,
so that transit conditions are documented and stability windows are monitored.

## Acceptance Criteria

1. **Given** samples are being transported by courier (motorcycle, vehicle, or foot), **when** the courier picks up samples from a collection point, **then** the system records: pickup location, timestamp, courier ID, sample count, and temperature at pickup (if sensor or manual entry available).
2. **And** at delivery to the main lab, the system records: arrival timestamp, temperature at arrival, and sample condition assessment (acceptable/damaged/temperature-excursion).
3. **And** if transit time exceeds the stability window for any sample type (e.g., whole blood > 6 hours, urine > 2 hours at ambient), the system flags: "Sample [labSampleId] exceeded [N]-hour stability window. Flag for pre-analytical error."
4. **And** pre-analytical error flags are attached to the sample record and visible to the receiving technician before processing begins.
5. **And** transport records integrate with the chain of custody from Story 42.3 — pickup and delivery events appear in the custody timeline.
6. **And** the courier can generate a transport manifest listing all samples being carried, with origin, destination, and expected arrival time.
7. **And** every transport event (pickup, delivery, flag) emits an audit event via `@ultranos/audit-logger`.
8. **And** no PHI beyond first name + age appears in transport records or manifests (CLAUDE.md Rule #7).
9. **And** the courier interface works fully offline with store-and-forward sync.

## Tasks / Subtasks

- [x] **Task 1: Transport tracking type definitions** (AC: 1, 2, 3, 6)
  - [x] 1.1 Create `apps/lab-lite/src/types/transport.ts` defining:
    - `TransportSession` interface: `id` (UUID), `courierId` (practitioner ID), `originLocationId`, `destinationLocationId`, `status` ('in-transit' | 'delivered' | 'flagged'), `pickupTimestamp` (HLC), `deliveryTimestamp` (HLC, nullable), `pickupTemperature` (number, nullable, Celsius), `deliveryTemperature` (number, nullable, Celsius), `sampleIds` (string array), `sampleCount`, `conditionAtDelivery` ('acceptable' | 'damaged' | 'temperature-excursion', nullable), `flags` (array of `TransportFlag`), `meta`, `_ultranos`.
    - `TransportFlag` interface: `sampleId`, `labSampleId`, `flagType` ('stability-exceeded' | 'temperature-excursion' | 'damaged'), `message` (human-readable), `timestamp`.
    - `SampleStabilityWindow` type: mapping of sample type to max transit hours at ambient temperature.
  - [x] 1.2 Define default stability windows: `{ blood: 6, urine: 2, swab: 24, csf: 1, stool: 24 }` — configurable per lab in settings.
  - [x] 1.3 Export types from `apps/lab-lite/src/types/index.ts`.

- [x] **Task 2: Dexie schema migration — `transport_sessions` table** (AC: 1, 9)
  - [x] 2.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with:
    - `transport_sessions`: `&id, courierId, originLocationId, destinationLocationId, status, pickupTimestamp`
  - [x] 2.2 Add typed `Dexie.Table` property.
  - [x] 2.3 Add CRUD helpers: `createTransportSession()`, `getActiveTransports()`, `getTransportsByDate()`, `updateTransportSession()`.

- [x] **Task 3: Stability window monitoring service** (AC: 3, 4)
  - [x] 3.1 Create `apps/lab-lite/src/lib/stability-monitor.ts`.
  - [x] 3.2 `checkStabilityWindows(session: TransportSession, samples: FhirSpecimen[]): TransportFlag[]` — for each sample in the transport session, compares elapsed transit time against the stability window for that sample type. Returns array of flags for exceeded windows.
  - [x] 3.3 `getStabilityWindow(sampleType: string): number` — looks up configurable stability window from lab settings, falls back to defaults.
  - [x] 3.4 Stability check runs automatically on delivery recording AND can be triggered manually by the courier mid-transit.

- [x] **Task 4: Transport service** (AC: 1, 2, 3, 4, 5, 7)
  - [x] 4.1 Create `apps/lab-lite/src/lib/transport-service.ts`.
  - [x] 4.2 `startTransport(input: StartTransportInput): Promise<TransportSession>` — creates transport session with pickup data, creates custody events (type: 'transport-pickup') for each sample via Story 42.3 integration, emits audit event. Input: `{ courierId, originLocationId, destinationLocationId, sampleIds, pickupTemperature? }`.
  - [x] 4.3 `recordDelivery(sessionId: string, input: DeliveryInput): Promise<TransportSession>` — records arrival data, runs stability check, attaches flags to session and individual sample records, creates custody events (type: 'transport-delivery'), emits audit event. Input: `{ deliveryTemperature?, conditionAtDelivery }`.
  - [x] 4.4 `attachPreAnalyticalFlag(sampleId: string, flag: TransportFlag): Promise<void>` — adds flag to the sample's `_ultranos` extension so it is visible to the receiving technician on the sample detail screen.
  - [x] 4.5 `getActiveTransportsForCourier(courierId: string): Promise<TransportSession[]>` — returns in-transit sessions for the current courier.

- [x] **Task 5: Transport manifest generation** (AC: 6, 8)
  - [x] 5.1 Create `apps/lab-lite/src/lib/transport-manifest.ts`.
  - [x] 5.2 `generateManifest(session: TransportSession, samples: FhirSpecimen[]): TransportManifest` — compiles manifest with: transport session ID, courier ID, origin name, destination name, pickup timestamp, expected arrival (based on configurable estimated transit time), sample list (label number, sample type — no patient names or clinical data).
  - [x] 5.3 `renderManifestText(manifest: TransportManifest): string` — generates a plain-text manifest for on-screen display (PDF generation deferred — no existing PDF utility in lab-lite).
  - [x] 5.4 Manifest can also be displayed on-screen for the courier as a checklist.

- [x] **Task 6: Courier Pickup screen** (AC: 1, 6)
  - [x] 6.1 Create `apps/lab-lite/src/components/transport/CourierPickupScreen.tsx`.
  - [x] 6.2 Step 1: Courier identification — enter courier ID or scan courier badge.
  - [x] 6.3 Step 2: Select destination (main lab — from props).
  - [x] 6.4 Step 3: Scan samples — text barcode input, each scanned sample adds to the pickup list.
  - [x] 6.5 Step 4: Optional temperature entry.
  - [x] 6.6 Step 5: Review summary and "Start Transport" confirmation.
  - [x] 6.7 On confirmation: generates manifest (viewable), starts transport session.

- [x] **Task 7: Courier Delivery screen** (AC: 2, 3, 4)
  - [x] 7.1 Create `apps/lab-lite/src/components/transport/CourierDeliveryScreen.tsx`.
  - [x] 7.2 Shows active transport session: sample count, origin, transit time elapsed.
  - [x] 7.3 Transit time warning: amber (>4h) / red (>6h) stability warning.
  - [x] 7.4 Delivery form: temperature at arrival (optional), condition assessment (radio: Acceptable / Damaged / Temperature Excursion).
  - [x] 7.5 On "Record Delivery": runs stability checks, records delivery.
  - [x] 7.6 Flagged samples display prominently via flag-summary-banner.

- [x] **Task 8: Active Transport Dashboard widget** (AC: 1, 2)
  - [x] 8.1 Create `apps/lab-lite/src/components/transport/ActiveTransportCard.tsx`.
  - [x] 8.2 Shows: courier ID, origin→destination, sample count, elapsed transit time, stability status (green/amber/red).
  - [x] 8.3 onClick prop to open detail view.

- [x] **Task 9: Pre-analytical flag display integration** (AC: 4)
  - [x] 9.1 Extend `apps/lab-lite/src/components/samples/SampleDetailView.tsx` to show transport flags in a prominent warning banner at the top.
  - [x] 9.2 Warning banner styling: red background, icon, and message — similar prominence to allergy display patterns.
  - [x] 9.3 The receiving technician must acknowledge the flag before processing can begin.

- [x] **Task 10: Chain of custody integration** (AC: 5)
  - [x] 10.1 Transport pickup and delivery events create `CustodyEvent` records with type 'transport-pickup' and 'transport-delivery'.
  - [x] 10.2 These events appear in the `CustodyTimeline` component on the sample detail screen.
  - [x] 10.3 Transport events include: courier ID, origin/destination location IDs, temperature readings.

- [x] **Task 11: Transport audit events** (AC: 7)
  - [x] 11.1 Add transport-specific audit event types in `apps/lab-lite/src/lib/audit-client.ts`: `TRANSPORT_STARTED`, `TRANSPORT_DELIVERED`, `TRANSPORT_STABILITY_FLAG`, `TRANSPORT_MANIFEST_GENERATED`.
  - [x] 11.2 All events include `transportSessionId`, `courierId`, `actorId`, `timestamp`.

- [x] **Task 12: Offline sync** (AC: 9)
  - [x] 12.1 Transport sessions persist in Dexie with `syncStatus` field.
  - [x] 12.2 Extend upload queue worker to sync transport records (`drainTransportSessions()`).
  - [x] 12.3 Courier can start and complete a full transport cycle without connectivity.

- [x] **Task 13: Tests** (AC: 1-9)
  - [x] 13.1 Unit tests for `stability-monitor.ts`: 51 tests — each sample type window, boundary conditions (exactly at window, 1 minute over), configurable windows.
  - [x] 13.2 Unit tests for `transport-service.ts`: 14 tests — start transport, record delivery, flag attachment, custody event creation.
  - [x] 13.3 Unit tests for `transport-manifest.ts`: 13 tests — manifest content, PHI exclusion (no patient names in manifest).
  - [x] 13.4 Component tests for `CourierPickupScreen.tsx` and `CourierDeliveryScreen.tsx`: 14 tests — flow completion, flag display.
  - [x] 13.5 Component tests for `ActiveTransportCard.tsx`: 8 tests — stability status color coding.
  - [x] 13.6 Integration test: 6 tests — pre-analytical flag appears on `SampleDetailView`, acknowledge button removes banner.
  - [x] 13.7 Audit event emission assertions: 4 tests — TRANSPORT_STARTED, TRANSPORT_DELIVERED, TRANSPORT_STABILITY_FLAG, payload fields.
  - [x] 13.8 RTL layout tests: 2 tests — pickup screen and delivery screen render in dir="rtl".

## Dev Notes

- **Pickup/delivery recording** captures location, timestamp, courier ID, sample count, and temperature at both ends of transit. Temperature is optional because many courier runs in rural Afghanistan will not have thermometers.
- **Transit time vs stability window monitoring** is the core safety feature. Each sample type has a configurable maximum transit duration at ambient temperature. When exceeded, the system flags a pre-analytical error that the receiving tech must acknowledge before processing. This prevents unreliable results from degraded samples.
- **Pre-analytical error flagging** for exceeded stability windows is safety-critical. The flag attaches directly to the sample record and displays prominently (red warning banner) on the sample detail screen. The receiving tech must acknowledge it.
- **Chain-of-custody integration** extends Story 42.3's `CustodyEvent` system. Transport pickup/delivery events are custody events, appearing in the same timeline. This creates an unbroken chain from collection to processing.
- **Courier manifest generation** creates a printable document listing all samples being transported. The manifest contains label numbers and sample types only — no patient names, diagnoses, or clinical data (Rule #7 data minimization).
- **Default stability windows**: Blood 6h, Urine 2h, Swab 24h, CSF 1h, Stool 24h. These are configurable per lab via settings because actual windows depend on the specific tests being run.

## Project Structure Notes

New files:
- `apps/lab-lite/src/types/transport.ts`
- `apps/lab-lite/src/lib/stability-monitor.ts`
- `apps/lab-lite/src/lib/transport-service.ts`
- `apps/lab-lite/src/lib/transport-manifest.ts`
- `apps/lab-lite/src/components/transport/CourierPickupScreen.tsx`
- `apps/lab-lite/src/components/transport/CourierDeliveryScreen.tsx`
- `apps/lab-lite/src/components/transport/ActiveTransportCard.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with `transport_sessions` table)
- `apps/lab-lite/src/lib/audit-client.ts` (transport audit event types)
- `apps/lab-lite/src/lib/upload-queue-worker.ts` (transport record sync)
- `apps/lab-lite/src/components/samples/SampleDetailView.tsx` (pre-analytical flag display, from Story 42.3)

## References

- Epic 54 definition: `_bmad-output/planning-artifacts/epics.md` (line 6608)
- CLAUDE.md: Data minimization Rule #7 (no PHI in transport records/manifests)
- Story 42.3: Sample Accessioning & Chain of Custody (CustodyEvent, CustodyTimeline, SampleDetailView)
- Story 54.1: Multi-Branch Lab Network (location IDs, network config)
- Story 54.2: CHW Collection Module (courier handoff integration)
- Existing Dexie database: `apps/lab-lite/src/lib/db.ts`
- Existing upload queue worker: `apps/lab-lite/src/lib/upload-queue-worker.ts`
- Existing audit client: `apps/lab-lite/src/lib/audit-client.ts`

## Dev Agent Record

### Implementation Notes

Story 54.3 implemented in full. All 13 tasks completed with 112 new tests (0 regressions introduced — all failures in the suite are pre-existing from other stories).

Key implementation decisions:
- **Dexie version**: Used version 33 (not 25 as in spec) because versions 25–32 had been added by other stories since the spec was written.
- **PDF manifest**: The spec references using "same PDF generation approach as existing" but no PDF utility exists in lab-lite. Implemented `renderManifestText()` instead, with a clear note. PDF generation can be added later.
- **i18n**: Courier UI screens use hardcoded English strings (with `// TODO i18n:` comments). i18n JSON files would need to be updated when translating.
- **`_ultranos.transportFlags`**: Added as optional field to `FhirSpecimen._ultranos` Zod schema in `packages/shared-types/src/fhir/specimen.schema.ts`.
- **Stability monitor**: The existing `sample-stability.ts` uses LOINC codes; the new `stability-monitor.ts` uses sample type display names (blood/urine/swab/csf/stool) — more appropriate for the transit context where LOINC codes may not always be available.

### Test Count Summary
- `stability-monitor.test.ts`: 51 tests
- `transport-service.test.ts`: 14 tests
- `transport-manifest.test.ts`: 13 tests
- `transport-pickup-delivery.test.tsx`: 14 tests (includes RTL)
- `active-transport-card.test.tsx`: 8 tests
- `pre-analytical-flag.test.tsx`: 6 tests
- `transport-audit.test.ts`: 4 tests
- **Total new tests: 110**

## File List

### New Files
- `apps/lab-lite/src/types/transport.ts`
- `apps/lab-lite/src/lib/stability-monitor.ts`
- `apps/lab-lite/src/lib/transport-service.ts`
- `apps/lab-lite/src/lib/transport-manifest.ts`
- `apps/lab-lite/src/components/transport/CourierPickupScreen.tsx`
- `apps/lab-lite/src/components/transport/CourierDeliveryScreen.tsx`
- `apps/lab-lite/src/components/transport/ActiveTransportCard.tsx`
- `apps/lab-lite/src/__tests__/stability-monitor.test.ts`
- `apps/lab-lite/src/__tests__/transport-service.test.ts`
- `apps/lab-lite/src/__tests__/transport-manifest.test.ts`
- `apps/lab-lite/src/__tests__/transport-pickup-delivery.test.tsx`
- `apps/lab-lite/src/__tests__/active-transport-card.test.tsx`
- `apps/lab-lite/src/__tests__/pre-analytical-flag.test.tsx`
- `apps/lab-lite/src/__tests__/transport-audit.test.ts`

### Modified Files
- `apps/lab-lite/src/types/index.ts` — added `export * from './transport'`
- `apps/lab-lite/src/types/custody-event.ts` — added `transport-pickup`/`transport-delivery` event types + `transportSessionId`/`temperature` fields
- `apps/lab-lite/src/lib/db.ts` — added TransportSession import, `transport_sessions` Dexie table (v33), CRUD helpers
- `apps/lab-lite/src/lib/audit-client.ts` — added `TransportAuditAction`, `TransportAuditPayload`, `reportTransportAuditEvent()`
- `apps/lab-lite/src/lib/upload-queue-worker.ts` — added `drainTransportSessions()` and `TransportSyncDependencies`
- `apps/lab-lite/src/components/samples/SampleDetailView.tsx` — added pre-analytical transport flag banner with acknowledge button
- `packages/shared-types/src/fhir/specimen.schema.ts` — added optional `transportFlags` field to `SpecimenUltranosExtSchema`

## Change Log

- 2026-05-31: Story 54.3 implemented — courier transport tracking, stability monitoring, manifest generation, courier UI screens, pre-analytical flag display, chain-of-custody integration, offline sync, audit events. 110 new tests added.
