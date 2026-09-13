# Lab-Lite Attachments — Photo/Document Capture, WebP Transcode & Zoomable Viewer

**Status:** Design (awaiting user approval before implementation plan)
**Date:** 2026-09-13
**Apps touched:** `lab-lite`, `opd-lite`, `hub-api`, `packages/ui-kit`, `packages/shared-types`, `supabase/migrations`
**Related prior work:** Story 12.3 (Result Upload), Story 16.8 (File download endpoint), Story 42.4 (structured result entry), Story 43.1 (lifecycle audit chain), Migration 007 (`diagnostic_reports` + `lab_result_files`).

---

## 1. Problem & Goal

The lab-lite **structured result-entry** workflow (where a technician types values and submits a `DiagnosticReport` back to the OPD doctor) has **no way to attach supporting photos** (e.g. microscopy, culture plate, gel, an instrument printout). A *separate* upload wizard (`ResultUpload.tsx`, `/upload`) exists for uploading whole scanned documents, but it is disconnected from structured entry, stores files as-is (no transcode), permits 20 MB, and does not permit WebP. The **sample receipt / rejection** workflow likewise cannot capture a photo of a damaged/mislabeled specimen (chain-of-custody evidence). On the OPD side, attachments render inline with no way to zoom.

**Goal (enterprise-grade attachment handling):**
1. Let a lab tech attach photos/documents **inside** the structured result-entry form and inside the sample **receive** and **rejection** flows.
2. Enforce **≤ 1 MB per photo** by **transcoding images client-side to high-definition WebP** (compress-to-target, not hard-reject).
3. Keep non-image **documents (PDF)** uploadable as-is under their own cap.
4. Give the OPD doctor a **zoom/pan viewer** for received attachments, built as a **shared ui-kit component**.
5. Wire the currently-unwired `SAMPLE_RECEIVED` / `SAMPLE_PROCESSED` lifecycle audit events (part of the "full sample workflow" scope).

---

## 2. Locked Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Scope | **Results + full sample workflow** (result attachments, sample receipt + rejection attachments, and wiring `SAMPLE_RECEIVED`/`SAMPLE_PROCESSED` audits). |
| D2 | Documents | **Photos → WebP ≤ 1 MB; PDFs kept as-is** under a 10 MB cap. Only image + PDF types allowed. |
| D3 | 1 MB rule | **Compress-to-target**: transcode to HD WebP and step quality/dimensions down until ≤ 1 MB; reject only if unreachable. |
| D4 | Viewer | **Shared `packages/ui-kit` component** (`image-viewer.tsx`), consumed by opd-lite (and reusable by lab-lite). |
| D5 | Attachment storage model | **Mirror the proven `lab_result_files` pattern** — reuse it for results (+ add `image/webp`), add a parallel `specimen_files` table for sample photos. No polymorphic table, no FHIR `DocumentReference` resource. |
| D6 | Transcode location | **Client-side** (browser Canvas/OffscreenCanvas). Offline-first; small payload enters the sync/upload queue. Server `sharp` stays for patient photos only. |
| D7 | Audit | Reuse `PHI_WRITE` (upload) / `PHI_READ` (view/download) with metadata, matching the existing `/api/lab-files` convention. No new `AuditAction` enum values. |
| D8 | Result-photo transport | **Ride the working `uploadResult` path** (post-verification). Structured-value distribution pipeline is unwired and out of scope (§3, §7). |
| D9 | Specimen-photo storage | **New hub `specimen_files` table (FK-less opaque `specimen_id`) + `uploadSpecimenFile` ingest + `/api/specimen-files/:id` download** (§8). |

**Constants (adjust here if desired):** `MAX_IMAGE_EDGE_PX = 2048` (HD longest edge), `TARGET_IMAGE_BYTES = 1_048_576` (1 MiB), `MIN_IMAGE_EDGE_PX = 1024` (downscale floor), `WEBP_QUALITY_LADDER = [0.9, 0.8, 0.7, 0.6, 0.5]`, `MAX_PDF_BYTES = 10_485_760` (10 MiB), `MAX_ATTACHMENTS_PER_PARENT = 10`.

---

## 3. Out of Scope (explicit)

- Fixing free-text specimen **rejection reasons** → structured codes.
- Adding specimen **container / volume / hemolysis-grade** fields.
- Server-side **virus scanning** implementation (the `scanFile` gate already exists in `uploadResult` and is respected; wiring a real scanner is separate).
- Migrating the existing standalone `/upload` scanned-document wizard (it keeps working; we integrate a new inline picker into structured entry rather than delete the wizard).
- HEIC decode support (browsers cannot reliably decode HEIC via canvas; see §5).
- **Fixing the pre-existing structured-result→OPD transport gap.** Verified: structured result *values* (the Observations bundle / Story 42.6 distribution pipeline) do **not** currently persist to the hub as an OPD-readable `DiagnosticReport` — `DiagnosticReport` is absent from `RESOURCE_TABLE_MAP` and `startDistributionDrainListener` has no non-test call site. This feature makes the **photo** reach OPD (via the working `uploadResult` path, §7); it does **not** repair the separate transport of typed result values. That gap is flagged for its own work item.

---

## 4. Architecture Overview

```
LAB-LITE (offline PWA)
  ResultEntryForm ─┐
  ReceiveSampleModal ─┤── <AttachmentPicker/> (new)
  Reject flow      ─┘        │
                             ├─ image → image-transcode.ts (canvas → WebP ≤1MB, EXIF-stripped)
                             ├─ pdf   → passthrough (≤10MB)
                             ▼
                   enqueue to upload queue (Blob + parentRef)
                             │  (offline-durable, FIFO, 3 retries)
                             ▼
HUB-API
  uploadResult (extended: optional diagnosticReportId | specimenId)
     ├─ upsert minimal parent row if not yet synced  (fixes FK ordering)
     ├─ AES-256-GCM encrypt base64, SHA-256 hash, store in lab_result_files | specimen_files
     └─ audit PHI_WRITE
  GET /api/lab-files/:id        (exists; add image/webp passthrough)
  GET /api/specimen-files/:id   (new; mirror; lab data-minimization preserved)
     └─ virus-scan gate + RBAC + consent + audit PHI_READ

OPD-LITE
  LabReportDetail / LabResultDetail
     └─ renders presentedForm[] ; images now open in ← shared viewer
                                                        │
UI-KIT
  <ImageViewer/> (new): Dialog-based lightbox, wheel+pinch zoom, drag-pan,
                 zoom in/out/reset, RTL-safe, ESC/keyboard, focus-trap.
```

---

## 5. Client-Side Image Transcode (`apps/lab-lite/src/lib/image-transcode.ts`)

Pure, Vitest-testable module. Local to lab-lite (YAGNI); clean interface so it is trivially extractable if pharmacy/opd need it later.

**Public API:**
```ts
export interface TranscodeResult {
  blob: Blob            // image/webp
  width: number
  height: number
  bytes: number
  originalType: string
}
export class TranscodeTooLargeError extends Error {}   // could not reach ≤1MB
export class TranscodeUnsupportedError extends Error {} // e.g. HEIC / non-decodable

export async function transcodeToWebp(file: File): Promise<TranscodeResult>
```

**Algorithm:**
1. Accept source `image/jpeg | image/png | image/webp`. Anything else → `TranscodeUnsupportedError` (HEIC included — browser canvas cannot decode it).
2. Decode via `createImageBitmap(file)` (strips EXIF/GPS automatically; falls back to `<img>`+canvas if unavailable).
3. Scale so longest edge ≤ `MAX_IMAGE_EDGE_PX` (never upscale). Preserve aspect ratio.
4. Draw to `OffscreenCanvas` (fallback `HTMLCanvasElement`), `canvas.convertToBlob({ type: 'image/webp', quality })` / `toBlob`.
5. Walk `WEBP_QUALITY_LADDER`; return first blob ≤ `TARGET_IMAGE_BYTES`.
6. If none fit, downscale longest edge ×0.85 and re-walk the ladder; repeat until edge < `MIN_IMAGE_EDGE_PX`, then throw `TranscodeTooLargeError`.

**Compliance:** re-encoding through canvas **strips EXIF** (GPS coordinates, capture timestamps, device serials) — a PHI/location-leak safeguard, not incidental. No PHI in logs on the error paths.

---

## 6. Attachment Picker UI (`apps/lab-lite/src/components/attachments/AttachmentPicker.tsx`)

One reusable component embedded in `ResultEntryForm`, `ReceiveSampleModal`, and the rejection flow.

- File input (`accept="image/jpeg,image/png,image/webp,application/pdf"`) + drag-drop.
- On image select → `transcodeToWebp`; show a spinner, then a thumbnail with final size badge (e.g. "312 KB · WebP"). On PDF → validate `application/pdf` and `≤ MAX_PDF_BYTES`, show a doc chip.
- Reject with explicit inline messaging: unsupported type, PDF too large, or `TranscodeTooLargeError`.
- Enforce `MAX_ATTACHMENTS_PER_PARENT`; allow remove-before-submit.
- Emits an array of prepared attachments `{ blob, fileName, fileType, kind }` to the host form; host enqueues them on submit (§7).
- Uses ui-kit primitives + `@ultranos/ui-kit/icons` (`Upload`, `X`, `FileText`, `ImageIcon`), semantic tokens, logical CSS props (RTL), and the shell layout rules. No inline hex/style.

---

## 7. Result-Photo Upload Path (via the working `uploadResult`, offline-first)

**Verified transport (D8):** the only live, hub-persisted, OPD-readable report writer is `uploadResult` ([`lab.ts:657`](../../../apps/hub-api/src/trpc/routers/lab.ts#L657)) — it creates a `diagnostic_reports` row + encrypted `lab_result_files`, runs `scanFile`, audits, and OPD reads it via `diagnosticReport.listByPatient`. Result photos ride **this** path. The photo therefore reaches OPD as a report OPD can already open; this does not depend on the (unwired) structured-values distribution pipeline (see §3 boundary).

### 7.1 One report per entry session, many photos
The result-entry form generates one `diagnosticReportId = crypto.randomUUID()` for the session. Each attached photo is enqueued with that id so all photos land on **one** report (not one report per photo). `result-to-fhir.ts`'s local `` `dr-${result.id}` `` id is unchanged — it is only used by the local/distribution projections, which are out of scope; the hub-facing report id is the new UUID passed to `uploadResult`.

### 7.2 Extend `UploadResultInput` + widen `fileType`
```ts
fileType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'  // + webp
diagnosticReportId?: string   // when present, attach to this report instead of creating a new one
```
`upload-queue-worker.ts` passes both through unchanged (Blob→base64 as today; 3 retries, 1s/4s/16s backoff, Low-Data 30-min batch — all reused). The standalone `/upload` wizard keeps calling `uploadResult` without `diagnosticReportId` (unchanged behavior) but gains `image/webp` acceptance.

### 7.3 Hub `uploadResult` handler changes
- Widen the `fileType` zod enum to include `image/webp`.
- If `diagnosticReportId` present → **upsert** a `diagnostic_reports` row keyed by that UUID (idempotent: first photo of the session creates it from `loincCode/loincDisplay/collectionDate/patientRef`; later photos of the same session skip creation), then insert the encrypted file into `lab_result_files` linked to it. This makes multiple photos share one report and removes any offline FK-ordering hazard. If absent → today's create-a-new-report behavior is untouched.
- Keep `scanFile` virus scan, AES-256-GCM `encryptField`, SHA-256 `file_hash`, and the 20 MB backstop; add explicit per-type client-and-server ceilings: image ≤ ~2 MB backstop (client targets ≤1 MB), PDF ≤ 10 MB.
- Emit `PHI_WRITE` (`metadata.operation = 'file_upload'`, opaque ids only), matching the `/api/lab-files` convention.

> **`loincCode` enum wrinkle (resolve in plan):** `uploadResult.loincCode` is a restricted 8-value zod enum. A structured-entry template's LOINC may fall outside it. The plan widens/relaxes this validation (accept any LOINC string, or map) so structured-entry photo reports aren't rejected. The standalone wizard's existing codes remain valid.

### 7.4 Priority
Photos sync at the **existing result/upload tier** — no new tier.

---

## 8. Data Model & Migrations (via Supabase MCP)

**Migration A — allow WebP on result files:** Migration 007 defined the CHECK inline (unnamed), so Postgres auto-named it `lab_result_files_file_type_check`. The migration looks the real name up (`information_schema.check_constraints`) before dropping, then re-adds a named one:
```sql
ALTER TABLE lab_result_files DROP CONSTRAINT lab_result_files_file_type_check;
ALTER TABLE lab_result_files ADD CONSTRAINT lab_result_files_file_type_check
  CHECK (file_type IN ('application/pdf','image/jpeg','image/png','image/webp'));
```
(Keep the existing 20 MB DB ceiling as a backstop; the ≤1 MB image / ≤10 MB PDF limits are enforced client-side and re-validated in the handler.)

**Migration B — `specimen_files`** (D9; mirror of `lab_result_files`, but **FK-less** because the hub has no `specimens`/`lab_samples` table — verified). `specimen_id` stores the opaque lab sample id the lab already holds (never a real patient UUID); `patient_ref` stores the opaque blind-index ref for the consent check on download:
```sql
CREATE TABLE specimen_files (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  specimen_id          TEXT NOT NULL,          -- opaque lab sample id (no hub specimens table exists)
  patient_ref          TEXT NOT NULL,          -- opaque HMAC blind-index ref (for consent check)
  lab_id               UUID NOT NULL REFERENCES labs(id),
  file_name            TEXT NOT NULL,
  file_type            TEXT NOT NULL CHECK (file_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  file_size            INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  encrypted_content    TEXT NOT NULL,
  file_hash            TEXT NOT NULL,
  virus_scan_status    TEXT NOT NULL DEFAULT 'pending'
                         CHECK (virus_scan_status IN ('pending','clean','infected','error')),
  attachment_context   TEXT NOT NULL DEFAULT 'receipt'
                         CHECK (attachment_context IN ('receipt','rejection')),
  _ultranos_created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_specimen_files_specimen ON specimen_files (specimen_id);
CREATE INDEX idx_specimen_files_lab ON specimen_files (lab_id);
```
Regenerate TS types after both migrations.

**Hub ingest + download for specimen photos (new, mirror of the result path):**
- New tRPC `lab.uploadSpecimenFile` — same middleware/guards as `uploadResult` (`labRestrictedProcedure` + verified-org + entitlement + lab-active); input `{ fileBase64, fileName, fileType, specimenId, patientRef, attachmentContext }`; runs `scanFile`, `encryptField`, SHA-256, inserts `specimen_files`, emits `PHI_WRITE`.
- New `GET /api/specimen-files/[fileId]/route.ts` — mirror of `/api/lab-files/[fileId]`: UUID validation, Bearer auth, RBAC, virus-scan-`clean` gate, consent check via `patient_ref`, decrypt, stream, `PHI_READ` audit. Enforces lab data-minimization (Rule #7): no raw National ID, no real patient UUID.
- Client: specimen photos enqueue through the existing upload-queue pattern, routed to `uploadSpecimenFile` (a sibling `uploadFn`), draining on reconnect like result photos.

**Shared types:** `AttachmentSchema` in `diagnostic-report.schema.ts` already covers `contentType/data/url/title/size`. Add optional `hash?: string` to align the FHIR `Attachment` with the stored SHA-256 (currently DB-only). `presentedForm[]` continues to be assembled in-memory on read.

---

## 9. OPD-Side Viewer

### 9.1 Shared component — `packages/ui-kit/src/components/ui/image-viewer.tsx`
- Built on the ui-kit `Dialog`; opens on image click/Enter.
- **Zoom:** buttons (zoom-in / zoom-out / reset-to-fit), mouse wheel, and touch pinch; clamp `scale ∈ [1, 8]`.
- **Pan:** drag when zoomed; touch-drag; keeps image within bounds.
- **A11y/RTL:** focus-trap, `Esc` to close, `aria-label`s, logical CSS props, controls mirror in RTL; medical-context icons do **not** mirror.
- Icons: ensure `ZoomIn`, `ZoomOut`, `Maximize`/`RotateCcw`, `X` are exported from `@ultranos/ui-kit/icons`.
- Rebuild ui-kit (`pnpm --filter @ultranos/ui-kit build`) after adding, per the source-level-only rule.

### 9.2 Wire into OPD
- In [`LabReportDetail.tsx`](../../../apps/opd-lite/src/components/clinical/LabReportDetail.tsx) and `LabResultDetail.tsx`, make `SAFE_IMAGE_PREFIXES` images clickable → open `<ImageViewer/>` (WebP already listed as safe). PDFs keep the existing `<embed>`.
- Emit `PHI_READ` (`metadata.phiAccess = 'lab_result_attachment_view'`) when the viewer opens — attachment view is a distinct PHI access (Rule #6).

---

## 10. Lifecycle Audit Wiring (D1)
Uncomment/implement the `reportLabLifecycleEvent(...)` calls flagged in `ReceiveSampleModal.tsx` (`SAMPLE_RECEIVED`) and `SampleDetailView.tsx` (`SAMPLE_PROCESSED`), using the existing `AuditAction.SAMPLE_RECEIVED` / `SAMPLE_PROCESSED` values and opaque ids only. No schema change.

---

## 11. Safety & Compliance Matrix

| Rule | How this design complies |
|------|--------------------------|
| #1 PHI never in logs | Transcode/upload/viewer error paths log shapes/ids only; no file bytes, names, or patient data. |
| #6 Audit every PHI access | Upload → `PHI_WRITE`; download + viewer-open → `PHI_READ`; sample lifecycle → `SAMPLE_RECEIVED`/`SAMPLE_PROCESSED`. |
| #7 Lab data-minimization | `specimen_files` endpoint follows the lab-facing rules — no raw National ID, no real patient UUID; lab only uses ids it already holds. Files keyed by their own UUID. |
| Encryption | Files AES-256-GCM at rest (`encrypted_content`); IndexedDB queue Blob cleared on drain; key in memory only. |
| Virus scan | Download endpoints keep the `virus_scan_status = 'clean'` gate; never serve pending/infected. |
| EXIF/location | Canvas re-encode strips EXIF/GPS before the image ever leaves the device. |
| Offline-first | Picker + transcode + queue all work offline; upload drains on reconnect; FK-ordering handled by upsert-minimal-parent. |

---

## 12. Testing Plan

- **Transcode (unit):** photo compresses to ≤1 MB; HD edge cap respected; aspect ratio preserved; PNG/JPEG/WebP inputs; EXIF absent in output; `TranscodeTooLargeError` and `TranscodeUnsupportedError` (HEIC) paths.
- **Picker (component):** accept/reject by type & size; PDF passthrough; max-count enforcement; remove-before-submit.
- **Upload (unit/integration):** `diagnosticReportId`/`specimenId` linkage; upsert-minimal-parent when parent not yet synced (FK-ordering); retry/backoff reuse; offline queue persistence across restart.
- **Hub handler:** `image/webp` accepted; `PHI_WRITE` emitted; encryption + hash stored.
- **Viewer (ui-kit):** zoom clamp, pan bounds, keyboard/ESC, **RTL snapshot** (LTR + RTL), focus-trap.
- **OPD wiring:** clicking an image opens viewer; `PHI_READ` emitted on open; PDF still embeds.
- **Audit:** assertions that upload, view, and each sample-lifecycle transition emit their events.

---

## 13. Files Touched (anticipated)

**New:** `apps/lab-lite/src/lib/image-transcode.ts`, `apps/lab-lite/src/components/attachments/AttachmentPicker.tsx`, `packages/ui-kit/src/components/ui/image-viewer.tsx`, `apps/hub-api/src/app/api/specimen-files/[fileId]/route.ts`, `lab.uploadSpecimenFile` procedure (in `lab.ts`), two Supabase migrations, tests for each.

**Modified:** `ResultEntryForm.tsx` (session report UUID + picker), `ResultUpload.tsx` (webp accept), `ReceiveSampleModal.tsx`, sample rejection flow + `SampleDetailView.tsx`, `upload-queue-worker.ts` (`fileType` widen + `diagnosticReportId` passthrough + specimen `uploadFn`), `UploadResultInput`/`trpc.ts`, hub `uploadResult` handler (webp enum, `diagnosticReportId` upsert, loincCode relax), `/api/lab-files/[fileId]/route.ts` (webp Content-Type ok), `LabReportDetail.tsx` + `LabResultDetail.tsx` (viewer), `diagnostic-report.schema.ts` (`hash?`), `packages/ui-kit/src/icons.ts` (zoom icons), i18n keys (4 locales), regenerated Supabase TS types.

---

## 14. Open Items — RESOLVED during planning verification
1. ✅ `DiagnosticReport` is **not** in `sync.push`'s `RESOURCE_TABLE_MAP`; the Story 42.6 distribution pipeline is **unwired** (`startDistributionDrainListener` has no non-test call site). → Result photos ride the working `uploadResult` path (D8, §7); structured-value transport gap is out of scope (§3).
2. ✅ No hub `specimens`/`lab_samples` table exists. → `specimen_files.specimen_id` is an **FK-less opaque TEXT** id; a new `lab.uploadSpecimenFile` + `/api/specimen-files/[fileId]` provide ingest/read (D9, §8).
3. ✅ Specimen photos will be hub-persisted (user chose the hub table), so a lab-facing download path is included; OPD viewing of specimen photos is not required and is not added.
```
