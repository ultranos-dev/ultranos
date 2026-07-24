# OPD Lite — Patient Photo Upload Modal (Design)

**Date:** 2026-07-23
**App:** `apps/opd-lite` (Desktop PWA) + `apps/hub-api` (Node backend)
**Status:** Approved design — pending implementation plan

## 1. Problem & Goal

The patient chart's profile-photo workflow (`PatientAvatar`) does a crude **immediate** upload on
file selection: no source choice, no preview, no crop, no confirmation, and a JPEG written straight
to Supabase Storage from the browser. Registration, by contrast, already has a polished
`PhotoCropModal` (zoom/pan/pinch, rule-of-thirds, size compression, i18n, ShadCN `Dialog`).

**Goal:** give the chart a complete, design-system-consistent profile-picture upload modal that
reuses the existing cropper, adds live webcam capture and photo removal, and re-encodes every
uploaded photo to **high-quality WebP with a resolution cap** using **Sharp** on the server.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Cropper reuse | Reuse + light refactor: extract headless `PhotoCropper` shared by registration and the chart |
| Capabilities | Upload from file, Take photo (device camera), Remove current photo |
| Camera method | Live webcam via `getUserMedia` **with graceful fallback** to file input |
| Image conversion | **Sharp** on the **Hub API** (server-side); browser never encodes the final image |
| Encode preset | Cap longest side **512px**, **WebP quality 80**, EXIF/metadata stripped |
| Storage bucket | `patient-photos` (existing); object key becomes `<patientId>.webp` |
| Write authority | Hub is source of truth — local Dexie/UI updates **only after** a 200 |

### Why Sharp lives on the Hub

Sharp is a native Node/libvips library — it cannot run in the browser and cannot run in Supabase
Edge Functions (Deno). The Hub API is already the Node backend, holds a **service-role** Supabase
client, owns the PHI trust boundary, has existing binary route handlers
(`api/lab-files/[fileId]`), and already performs `patient.update`. Doing the conversion there also
**upgrades security**: the server re-encodes an untrusted client image, strips EXIF/GPS metadata,
enforces the resolution cap authoritatively, and performs upload + `photo_url` set + audit as one
server action.

## 3. Architecture & Flow

```
Avatar (camera overlay click) ──► PatientPhotoUploadModal (single ShadCN Dialog)
                                  │
   ┌──────────────────────── step machine ────────────────────────┐
   │ 'source'    current-photo preview + [Upload file][Take photo][Remove] │
   │ 'camera'    live webcam preview (getUserMedia) → [Capture]  ·fallback→ file │
   │ 'crop'      <PhotoCropper> (shared) → [Back] [Confirm]        │
   │ 'uploading' spinner + "Saving photo…"                         │
   │ 'error'     inline Alert (offline / hub / size / camera) + [Retry] │
   │ 'success'   brief confirmation, auto-close                    │
   └───────────────────────────────────────────────────────────────┘
```

### Upload (happy path)

1. Avatar camera overlay click → modal opens at step `source`.
2. Source:
   - **Upload file** → file input → `FileReader` → data-URL → step `crop`.
   - **Take photo** → step `camera` → `useWebcamCapture` (`getUserMedia`) → Capture → frame
     data-URL → step `crop`. If `getUserMedia` denied/absent → auto-fallback to file input.
3. Step `crop`: `<PhotoCropper rawDataUrl>` → Confirm → cropped data-URL → `Blob`.
4. Step `uploading`: `uploadPatientPhoto(patientId, blob, patient.meta.lastUpdated)` →
   multipart `POST /api/patient-photo` with `Authorization: Bearer <token>` (via `hub-auth`).
5. Hub: verify token → RBAC → Sharp (`rotate` → `resize ≤512 inside` → `webp q80`, metadata
   stripped) → Storage `upsert patient-photos/<id>.webp` → `patients.photo_url=<key>` (optimistic
   on `lastKnownUpdate`, HLC/meta bump) → audit `UPDATE Patient` → `200 { photoUrl, lastUpdated }`.
6. Client: update Dexie (`_ultranos.photoUrl=key`, `meta.lastUpdated`) → `onPhotoUpdated(key)` →
   `PatientAvatar` re-fetches signed URL for `<key>` → step `success` → auto-close (~800ms).

### Remove

`source` → [Remove] → inline confirm → `DELETE /api/patient-photo` → Hub removes `<id>.webp`
(+ legacy `.jpg`) → `photo_url=null` → audit → 200 → Dexie `photoUrl=undefined` → avatar shows
initials → close.

### Read (display)

`PatientAvatar`: if `_ultranos.photoUrl` → `createSignedUrl(photoUrl, 3600)` → `<img>`, else
initials. Reads the **stored key**, so legacy `<id>.jpg` photos keep working alongside `<id>.webp`.

**Key contract:** `patient.photo_url` stores the **object key** (`<id>.webp`), not a URL. Signed
URLs are minted on demand.

## 4. Components & Responsibilities

### Client (`apps/opd-lite`)

- **`PhotoCropper`** *(new, extracted)* — headless crop UI lifted from `PhotoCropModal`'s content
  (viewport, zoom/pan/pinch, grid, corner brackets). Props `{ rawDataUrl, onCropped(dataUrl) }`.
  No Dialog wrapper. Drops the client-side JPEG compression loop (server re-encodes); emits a
  high-fidelity crop.
- **`PhotoCropModal`** *(registration, refactored)* — thin `Dialog` + `<PhotoCropper>`. External
  behavior unchanged; registration still stores the cropped data-URL in form state and uploads at
  registration submit.
- **`PatientPhotoUploadModal`** *(new)* — the chart workflow. Owns the step machine, webcam, and
  the upload/remove calls; refreshes the signed URL and calls `onPhotoUpdated(key)` on success.
- **`useWebcamCapture`** *(new hook)* — `getUserMedia` stream lifecycle, capture frame → data-URL,
  permission/no-device detection → fallback signal.
- **`patient-photo-api.ts`** *(new client lib)* — `uploadPatientPhoto(patientId, blob,
  lastKnownUpdate)` and `removePatientPhoto(patientId, lastKnownUpdate)`, using the shared
  `getAuthHeaders()` from `hub-auth.ts`. Multipart POST / DELETE.
- **`PatientAvatar`** *(modified)* — camera overlay opens the modal instead of the raw input; keeps
  initials fallback + signed-URL display; reads the stored `photoUrl` key for `createSignedUrl`
  instead of the hardcoded `${patientId}.jpg`. The old immediate-upload logic is removed.

### Server (`apps/hub-api`)

- **`POST /api/patient-photo`** *(new route handler)* — auth per the `lab-files` pattern (Bearer →
  `verifySupabaseJwt` → build user) → RBAC `hasResourceAccess(role,'Patient')` → parse multipart →
  **Sharp**: `.rotate()` (auto-orient) → `.resize(512,512,{fit:'inside',withoutEnlargement:true})`
  → `.webp({quality:80})` → `toBuffer()` (metadata stripped by default) → Storage upsert
  `patient-photos/<patientId>.webp` (service client, `contentType:'image/webp'`) →
  `patients.photo_url=<key>` with optimistic `lastKnownUpdate` guard + HLC/meta bump → audit
  `UPDATE Patient` → `200 { photoUrl, lastUpdated }`.
- **`DELETE /api/patient-photo`** — removes `<patientId>.webp` (and legacy `.jpg`) →
  `photo_url=null` → audit → 200.

This consolidates the photo write into **one atomic, server-audited action**, so the client no
longer makes a separate `patient.update` for photos. `PatientHeaderCard.handlePhotoUpdated` is
therefore simplified: it drops its `patient.update` fetch entirely and becomes a
local-state/Dexie updater invoked after the modal reports a 200 (the Hub already persisted
`photo_url` and audited). Unrelated profile edits stay in `PatientEditModal`, which keeps its own
`patient.update` path.

## 5. Error Handling & States

Inline `Alert` in the modal, never silent (CLAUDE.md safety rules):

| Condition | Behavior |
|---|---|
| Offline (`!navigator.onLine`) | Upload / Take-photo / Remove disabled + "Photo changes need an internet connection." |
| Camera denied / no device | Auto-fallback to file input + subtle note; never a dead end. |
| File too large (>20MB pre-crop) | Reject before crop with size message (mirrors registration `RAW_SIZE_LIMIT`). |
| Hub 4xx/5xx or network throw | step `error` + "Couldn't save photo" + **Retry** / Cancel. Nothing written locally. |
| 409 optimistic conflict (stale `lastKnownUpdate`) | "Patient was updated elsewhere — reopen and retry." |
| Success | Brief confirmation, auto-close (~800ms). |

**Non-negotiable:** the Hub write is the source of truth — Dexie/UI update **only after** a 200
(no optimistic-then-diverge like the prior missing-auth bug). Every upload/remove emits a
server-side audit event.

**Offline stance:** photo changes require the Hub (network) and are **not** queued offline —
Storage blobs don't fit the sync queue. Consistent with today's behavior of requiring connectivity.

## 6. Testing

- **Client unit:** `PatientPhotoUploadModal` step transitions; upload sends `Authorization` +
  multipart to `/api/patient-photo`; success updates Dexie + calls `onPhotoUpdated`; failure
  surfaces an error and writes nothing; offline disables actions; remove calls DELETE.
  `useWebcamCapture` fallback on `getUserMedia` rejection. `PhotoCropper` crop-geometry parity
  (registration behavior unchanged).
- **Server unit:** route rejects missing/invalid bearer (401) and wrong role (403); Sharp output is
  `image/webp` and ≤512px (assert via Sharp metadata on the returned buffer); EXIF stripped; audit
  emitted on success; stale `lastKnownUpdate` → 409.
- **RTL:** modal snapshot LTR + RTL (patient-facing component requirement).
- **i18n:** new keys added to `en`/`ar`/`prs`/`ps` under a `patientPhoto` namespace.

## 7. Dependencies & Migration

- **New dependency:** `sharp` in `apps/hub-api/package.json`.
- **Storage key change:** new uploads write `<patientId>.webp`; `photo_url` stores the real key so
  legacy `<patientId>.jpg` records continue to resolve. No bulk migration required.
- **No DB schema change** expected (reuses existing `patients.photo_url`). Confirm the column
  exists and is nullable during planning.

## 8. Out of Scope (YAGNI)

- Re-cropping an already-stored photo without re-uploading.
- Full-size photo viewer / lightbox.
- Offline photo queueing.
- Multiple photos / photo history.

## 9. Open Items to Confirm During Planning

- Exact multipart field names and DELETE payload shape for `/api/patient-photo`.
- Confirm `patients.photo_url` column name/nullability and how HLC/meta bump is applied on the
  server write (align with existing `patient.update` resolver).
- Whether `sharp` needs any CI/Docker build consideration for the Hub image.
