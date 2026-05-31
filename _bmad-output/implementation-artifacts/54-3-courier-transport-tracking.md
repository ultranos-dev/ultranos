# Story 54.3: Courier & Sample Transport Tracking

Status: draft

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

- [ ] **Task 1: Transport tracking type definitions** (AC: 1, 2, 3, 6)
  - [ ] 1.1 Create `apps/lab-lite/src/types/transport.ts` defining:
    - `TransportSession` interface: `id` (UUID), `courierId` (practitioner ID), `originLocationId`, `destinationLocationId`, `status` ('in-transit' | 'delivered' | 'flagged'), `pickupTimestamp` (HLC), `deliveryTimestamp` (HLC, nullable), `pickupTemperature` (number, nullable, Celsius), `deliveryTemperature` (number, nullable, Celsius), `sampleIds` (string array), `sampleCount`, `conditionAtDelivery` ('acceptable' | 'damaged' | 'temperature-excursion', nullable), `flags` (array of `TransportFlag`), `meta`, `_ultranos`.
    - `TransportFlag` interface: `sampleId`, `labSampleId`, `flagType` ('stability-exceeded' | 'temperature-excursion' | 'damaged'), `message` (human-readable), `timestamp`.
    - `SampleStabilityWindow` type: mapping of sample type to max transit hours at ambient temperature.
  - [ ] 1.2 Define default stability windows: `{ blood: 6, urine: 2, swab: 24, csf: 1, stool: 24 }` — configurable per lab in settings.
  - [ ] 1.3 Export types from `apps/lab-lite/src/types/index.ts`.

- [ ] **Task 2: Dexie schema migration — `transport_sessions` table** (AC: 1, 9)
  - [ ] 2.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with:
    - `transport_sessions`: `&id, courierId, originLocationId, destinationLocationId, status, pickupTimestamp`
  - [ ] 2.2 Add typed `Dexie.Table` property.
  - [ ] 2.3 Add CRUD helpers: `createTransportSession()`, `getActiveTransports()`, `getTransportsByDate()`, `updateTransportSession()`.

- [ ] **Task 3: Stability window monitoring service** (AC: 3, 4)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/stability-monitor.ts`.
  - [ ] 3.2 `checkStabilityWindows(session: TransportSession, samples: FhirSpecimen[]): TransportFlag[]` — for each sample in the transport session, compares elapsed transit time against the stability window for that sample type. Returns array of flags for exceeded windows.
  - [ ] 3.3 `getStabilityWindow(sampleType: string): number` — looks up configurable stability window from lab settings, falls back to defaults.
  - [ ] 3.4 Stability check runs automatically on delivery recording AND can be triggered manually by the courier mid-transit.

- [ ] **Task 4: Transport service** (AC: 1, 2, 3, 4, 5, 7)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/transport-service.ts`.
  - [ ] 4.2 `startTransport(input: StartTransportInput): Promise<TransportSession>` — creates transport session with pickup data, creates custody events (type: 'transport-pickup') for each sample via Story 42.3 integration, emits audit event. Input: `{ courierId, originLocationId, destinationLocationId, sampleIds, pickupTemperature? }`.
  - [ ] 4.3 `recordDelivery(sessionId: string, input: DeliveryInput): Promise<TransportSession>` — records arrival data, runs stability check, attaches flags to session and individual sample records, creates custody events (type: 'transport-delivery'), emits audit event. Input: `{ deliveryTemperature?, conditionAtDelivery }`.
  - [ ] 4.4 `attachPreAnalyticalFlag(sampleId: string, flag: TransportFlag): Promise<void>` — adds flag to the sample's `_ultranos` extension so it is visible to the receiving technician on the sample detail screen.
  - [ ] 4.5 `getActiveTransportsForCourier(courierId: string): Promise<TransportSession[]>` — returns in-transit sessions for the current courier.

- [ ] **Task 5: Transport manifest generation** (AC: 6, 8)
  - [ ] 5.1 Create `apps/lab-lite/src/lib/transport-manifest.ts`.
  - [ ] 5.2 `generateManifest(session: TransportSession, samples: FhirSpecimen[]): TransportManifest` — compiles manifest with: transport session ID, courier ID, origin name, destination name, pickup timestamp, expected arrival (based on configurable estimated transit time), sample list (label number, sample type — no patient names or clinical data).
  - [ ] 5.3 `renderManifestPDF(manifest: TransportManifest): Blob` — generates a printable PDF manifest. Uses same PDF generation approach as existing lab report generation.
  - [ ] 5.4 Manifest can also be displayed on-screen for the courier as a checklist.

- [ ] **Task 6: Courier Pickup screen** (AC: 1, 6)
  - [ ] 6.1 Create `apps/lab-lite/src/components/transport/CourierPickupScreen.tsx`.
  - [ ] 6.2 Step 1: Courier identification — enter courier ID or scan courier badge.
  - [ ] 6.3 Step 2: Select destination (main lab — populated from network config, Story 54.1).
  - [ ] 6.4 Step 3: Scan samples — camera barcode scanner, each scanned sample adds to the pickup list. Shows sample type icon, label number. Unscanned samples from today's collection log are shown as "remaining".
  - [ ] 6.5 Step 4: Optional temperature entry.
  - [ ] 6.6 Step 5: Review summary and "Start Transport" confirmation.
  - [ ] 6.7 On confirmation: generates manifest (viewable/printable), starts transport session.

- [ ] **Task 7: Courier Delivery screen** (AC: 2, 3, 4)
  - [ ] 7.1 Create `apps/lab-lite/src/components/transport/CourierDeliveryScreen.tsx`.
  - [ ] 7.2 Shows active transport session: sample count, origin, transit time elapsed.
  - [ ] 7.3 Transit time warning: if approaching or exceeding any sample's stability window, show amber/red warning with affected sample list.
  - [ ] 7.4 Delivery form: temperature at arrival (optional), condition assessment (radio: Acceptable / Damaged / Temperature Excursion).
  - [ ] 7.5 On "Record Delivery": runs stability checks, shows any flagged samples with pre-analytical error messages, records delivery.
  - [ ] 7.6 Flagged samples display prominently: "2 of 8 samples flagged for pre-analytical review."

- [ ] **Task 8: Active Transport Dashboard widget** (AC: 1, 2)
  - [ ] 8.1 Create `apps/lab-lite/src/components/transport/ActiveTransportCard.tsx`.
  - [ ] 8.2 Shows on the main lab dashboard: active transports in progress with courier ID, origin, sample count, elapsed transit time, and stability status (green/amber/red based on nearest stability window expiry).
  - [ ] 8.3 Tapping a transport opens the detail view.

- [ ] **Task 9: Pre-analytical flag display integration** (AC: 4)
  - [ ] 9.1 Extend `apps/lab-lite/src/components/samples/SampleDetailView.tsx` (from Story 42.3) to show transport flags in a prominent warning banner at the top of the sample detail.
  - [ ] 9.2 Warning banner styling: red background, icon, and message — similar prominence to allergy display patterns.
  - [ ] 9.3 The receiving technician must acknowledge the flag before processing can begin (confirmation button: "I acknowledge this sample has a pre-analytical concern").

- [ ] **Task 10: Chain of custody integration** (AC: 5)
  - [ ] 10.1 Transport pickup and delivery events create `CustodyEvent` records (from Story 42.3) with type 'transport-pickup' and 'transport-delivery'.
  - [ ] 10.2 These events appear in the `CustodyTimeline` component on the sample detail screen.
  - [ ] 10.3 Transport events include: courier ID, origin/destination location names, temperature readings, and any flags.

- [ ] **Task 11: Transport audit events** (AC: 7)
  - [ ] 11.1 Add transport-specific audit event types in `apps/lab-lite/src/lib/audit-client.ts`: `TRANSPORT_STARTED`, `TRANSPORT_DELIVERED`, `TRANSPORT_STABILITY_FLAG`, `TRANSPORT_MANIFEST_GENERATED`.
  - [ ] 11.2 All events include `transportSessionId`, `courierId`, `actorId`, `timestamp`.

- [ ] **Task 12: Offline sync** (AC: 9)
  - [ ] 12.1 Transport sessions persist in Dexie with `syncStatus` field.
  - [ ] 12.2 Extend upload queue worker to sync transport records.
  - [ ] 12.3 Courier can start and complete a full transport cycle without connectivity.

- [ ] **Task 13: Tests** (AC: 1-9)
  - [ ] 13.1 Unit tests for `stability-monitor.ts`: each sample type window, boundary conditions (exactly at window, 1 minute over), configurable windows.
  - [ ] 13.2 Unit tests for `transport-service.ts`: start transport, record delivery, flag attachment, custody event creation.
  - [ ] 13.3 Unit tests for `transport-manifest.ts`: manifest content, PHI exclusion (no patient names in manifest).
  - [ ] 13.4 Component tests for `CourierPickupScreen.tsx` and `CourierDeliveryScreen.tsx`: flow completion, flag display.
  - [ ] 13.5 Component tests for `ActiveTransportCard.tsx`: stability status color coding.
  - [ ] 13.6 Integration test: pre-analytical flag appears on `SampleDetailView` after flagged delivery.
  - [ ] 13.7 Audit event emission assertions for all transport operations.
  - [ ] 13.8 RTL layout tests for transport components.

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
