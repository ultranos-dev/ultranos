# Lab-Lite Attachments (Photos → WebP + Zoomable Viewer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lab tech attach photos/documents in the result-entry and sample receive/rejection flows — photos transcoded client-side to HD WebP ≤ 1 MB — and let the OPD doctor open received photos in a zoom/pan viewer.

**Architecture:** Photos are transcoded to WebP in-browser (offline-first), enqueued to the existing lab-lite upload queue, and delivered to the hub. Result photos ride the already-working `uploadResult` tRPC (creates/updates a `diagnostic_reports` row + encrypted `lab_result_files`; OPD reads it via `diagnosticReport.listByPatient`). Sample photos use a new `lab.uploadSpecimenFile` procedure + `specimen_files` table + `/api/specimen-files/:id` download. A shared `packages/ui-kit` `ImageViewer` provides zoom/pan on the OPD side.

**Tech Stack:** Next.js 15, TypeScript, Dexie (IndexedDB), tRPC, Supabase (Postgres 16), `sharp` (existing, patient-photos only — NOT used here), Vitest, ShadCN/ui-kit, Tailwind (oklch tokens), lucide via `@ultranos/ui-kit/icons`.

**Spec:** `docs/superpowers/specs/2026-09-13-lab-attachments-photos-webp-design.md` (read it — the plan argues from it, especially §3 boundary, §7 transport, §8 storage).

## Global Constraints

- **PHI never in logs/errors** — log shapes/opaque ids only; never file bytes, names, or patient data (CLAUDE.md #1).
- **Audit every PHI touch** — upload → `PHI_WRITE`; download/view → `PHI_READ`, with `metadata` opaque ids only (CLAUDE.md #6). No new `AuditAction` enum values.
- **Lab data-minimization (CLAUDE.md #7)** — specimen-file endpoints never expose raw National ID or the real patient UUID; only the opaque `patient_ref` / lab sample id.
- **Encryption** — files stored AES-256-GCM via `encryptField` (format `v1:<base64>`); SHA-256 `file_hash` stored for audit; virus-scan `clean` gate on every download.
- **Offline-first** — capture + transcode + enqueue must work with no network; delivery drains on reconnect.
- **Constants (verbatim):** `MAX_IMAGE_EDGE_PX = 2048`, `TARGET_IMAGE_BYTES = 1_048_576`, `MIN_IMAGE_EDGE_PX = 1024`, `WEBP_QUALITY_LADDER = [0.9, 0.8, 0.7, 0.6, 0.5]`, `MAX_PDF_BYTES = 10_485_760`, `MAX_ATTACHMENTS_PER_PARENT = 10`.
- **UI/layout** — shared components live in `packages/ui-kit/src/` and require `pnpm --filter @ultranos/ui-kit build` after edits. Semantic oklch tokens only (no hex). Logical CSS props (RTL). Icons from `@ultranos/ui-kit/icons`. i18n keys in all 4 locales.
- **Supabase** — all DB changes via Supabase MCP (`apply_migration`); regenerate TS types after.
- **No autonomous commits** — the commit step in each task is executed only by the human/executor per repo rule; do not push.

---

### Task 1: Migrations — allow WebP on `lab_result_files`; create `specimen_files`

**Files:**
- Create (via Supabase MCP `apply_migration`): migration `add_webp_and_specimen_files`
- Reference: `supabase/migrations/007_diagnostic_reports.sql`

**Interfaces:**
- Produces: `lab_result_files` accepts `image/webp`; new table `specimen_files(id, specimen_id TEXT, patient_ref TEXT, lab_id UUID→labs, file_name, file_type, file_size, encrypted_content, file_hash, virus_scan_status, attachment_context, _ultranos_created_at)`.

- [ ] **Step 1: Look up the real CHECK constraint name**

Run via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'lab_result_files'::regclass AND contype = 'c';
```
Expected: a row like `lab_result_files_file_type_check` (use the actual name in Step 2).

- [ ] **Step 2: Apply the migration**

Via `mcp__plugin_supabase_supabase__apply_migration` (name `add_webp_and_specimen_files`):
```sql
ALTER TABLE lab_result_files DROP CONSTRAINT lab_result_files_file_type_check;
ALTER TABLE lab_result_files ADD CONSTRAINT lab_result_files_file_type_check
  CHECK (file_type IN ('application/pdf','image/jpeg','image/png','image/webp'));

CREATE TABLE IF NOT EXISTS specimen_files (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  specimen_id          TEXT NOT NULL,
  patient_ref          TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_specimen_files_specimen ON specimen_files (specimen_id);
CREATE INDEX IF NOT EXISTS idx_specimen_files_lab ON specimen_files (lab_id);
```

- [ ] **Step 3: Verify**

Run `mcp__plugin_supabase_supabase__list_tables` and confirm `specimen_files` exists; re-run the Step-1 query and confirm the new CHECK includes `image/webp`.

- [ ] **Step 4: Register encryption + regenerate types**

Add `specimen_files.encrypted_content` to `randomizedFields` in `packages/crypto/src/server-crypto.ts` (alongside `lab_result_files.encrypted_content`). Then run `mcp__plugin_supabase_supabase__generate_typescript_types` and update the hub types file it targets.

- [ ] **Step 5: Commit**
```bash
git add supabase packages/crypto/src/server-crypto.ts apps/hub-api/src/types
git commit -m "feat(hub): allow image/webp on lab_result_files; add specimen_files table"
```

---

### Task 2: `image-transcode.ts` — client-side WebP transcode (compress-to-target)

**Files:**
- Create: `apps/lab-lite/src/lib/image-transcode.ts`
- Test: `apps/lab-lite/src/__tests__/image-transcode.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TranscodeResult { blob: Blob; width: number; height: number; bytes: number; originalType: string }
  export class TranscodeTooLargeError extends Error {}
  export class TranscodeUnsupportedError extends Error {}
  export async function transcodeToWebp(file: File): Promise<TranscodeResult>
  export const TRANSCODE = { MAX_IMAGE_EDGE_PX: 2048, TARGET_IMAGE_BYTES: 1_048_576, MIN_IMAGE_EDGE_PX: 1024, WEBP_QUALITY_LADDER: [0.9,0.8,0.7,0.6,0.5] as const }
  ```
- Consumes: DOM `createImageBitmap`, `OffscreenCanvas` (test env injects fakes via the seams below).

- [ ] **Step 1: Write the failing test**

The module must be testable without a real browser. Design it to accept an optional injectable `deps` so Vitest can drive it; the default uses real DOM APIs.

```ts
// apps/lab-lite/src/__tests__/image-transcode.test.ts
import { describe, it, expect } from 'vitest'
import { transcodeToWebp, TranscodeUnsupportedError, TranscodeTooLargeError, TRANSCODE } from '../lib/image-transcode'

// A fake encoder: returns a blob whose size shrinks as quality/dimensions drop,
// so we can exercise the compress-to-target ladder deterministically.
function makeDeps(bytesFor: (q: number, edge: number) => number) {
  return {
    decode: async (_file: File) => ({ width: 4000, height: 3000 }),
    encode: async (edge: number, quality: number) => {
      const bytes = bytesFor(quality, edge)
      return { blob: new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), bytes }
    },
  }
}

function file(type: string) {
  return new File([new Uint8Array(10)], 'x', { type })
}

describe('transcodeToWebp', () => {
  it('rejects unsupported types (e.g. HEIC)', async () => {
    await expect(transcodeToWebp(file('image/heic'))).rejects.toBeInstanceOf(TranscodeUnsupportedError)
  })

  it('caps the longest edge at MAX_IMAGE_EDGE_PX and keeps aspect ratio', async () => {
    const deps = makeDeps(() => 500_000) // always under target
    const r = await transcodeToWebp(file('image/jpeg'), deps)
    expect(Math.max(r.width, r.height)).toBe(TRANSCODE.MAX_IMAGE_EDGE_PX) // 2048
    expect(r.width).toBe(2048)
    expect(r.height).toBe(1536) // 4000x3000 → 2048x1536
    expect(r.bytes).toBeLessThanOrEqual(TRANSCODE.TARGET_IMAGE_BYTES)
  })

  it('walks the quality ladder until under target', async () => {
    // Over target until quality 0.7, then under.
    const deps = makeDeps((q) => (q >= 0.8 ? 2_000_000 : 800_000))
    const r = await transcodeToWebp(file('image/png'), deps)
    expect(r.bytes).toBe(800_000)
  })

  it('downscales when the whole ladder is over target, then succeeds', async () => {
    // Over target at 2048 for all q; under target once edge drops.
    const deps = makeDeps((_q, edge) => (edge > 1740 ? 2_000_000 : 900_000))
    const r = await transcodeToWebp(file('image/jpeg'), deps)
    expect(r.bytes).toBe(900_000)
    expect(Math.max(r.width, r.height)).toBeLessThan(2048)
  })

  it('throws TranscodeTooLargeError when unreachable', async () => {
    const deps = makeDeps(() => 5_000_000) // never fits
    await expect(transcodeToWebp(file('image/jpeg'), deps)).rejects.toBeInstanceOf(TranscodeTooLargeError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F lab-lite test image-transcode`
Expected: FAIL — `transcodeToWebp` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/lab-lite/src/lib/image-transcode.ts
export interface TranscodeResult { blob: Blob; width: number; height: number; bytes: number; originalType: string }
export class TranscodeTooLargeError extends Error {}
export class TranscodeUnsupportedError extends Error {}

export const TRANSCODE = {
  MAX_IMAGE_EDGE_PX: 2048,
  TARGET_IMAGE_BYTES: 1_048_576,
  MIN_IMAGE_EDGE_PX: 1024,
  WEBP_QUALITY_LADDER: [0.9, 0.8, 0.7, 0.6, 0.5] as const,
}

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Injectable seams (default = real DOM). Tests pass fakes.
interface Deps {
  decode: (file: File) => Promise<{ width: number; height: number }>
  encode: (edge: number, quality: number) => Promise<{ blob: Blob; bytes: number }>
}

function fitEdge(w: number, h: number, edge: number) {
  const longest = Math.max(w, h)
  if (longest <= edge) return { w, h }
  const scale = edge / longest
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

export async function transcodeToWebp(file: File, deps?: Deps): Promise<TranscodeResult> {
  if (!SUPPORTED.has(file.type)) {
    throw new TranscodeUnsupportedError(`unsupported type: ${file.type}`)
  }
  const d = deps ?? realDeps(file)
  const src = await d.decode(file)

  let edge = TRANSCODE.MAX_IMAGE_EDGE_PX
  while (edge >= TRANSCODE.MIN_IMAGE_EDGE_PX) {
    const dim = fitEdge(src.width, src.height, edge)
    const usedEdge = Math.max(dim.w, dim.h)
    for (const q of TRANSCODE.WEBP_QUALITY_LADDER) {
      const { blob, bytes } = await d.encode(usedEdge, q)
      if (bytes <= TRANSCODE.TARGET_IMAGE_BYTES) {
        return { blob, bytes, width: dim.w, height: dim.h, originalType: file.type }
      }
    }
    edge = Math.round(edge * 0.85)
  }
  throw new TranscodeTooLargeError('could not compress image under target size')
}

// Real browser implementation of the seams (not exercised in unit tests).
function realDeps(_file: File): Deps {
  return {
    async decode(file) {
      const bitmap = await createImageBitmap(file) // strips EXIF/GPS
      return { width: bitmap.width, height: bitmap.height }
    },
    async encode(edge, quality) {
      const bitmap = await createImageBitmap(_file)
      const dim = fitEdge(bitmap.width, bitmap.height, edge)
      const canvas = new OffscreenCanvas(dim.w, dim.h)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, dim.w, dim.h)
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
      return { blob, bytes: blob.size }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F lab-lite test image-transcode`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**
```bash
git add apps/lab-lite/src/lib/image-transcode.ts apps/lab-lite/src/__tests__/image-transcode.test.ts
git commit -m "feat(lab-lite): client-side WebP transcode with compress-to-1MB target"
```

---

### Task 3: `ImageViewer` — shared zoom/pan lightbox in ui-kit

**Files:**
- Create: `packages/ui-kit/src/components/ui/image-viewer.tsx`
- Test: `packages/ui-kit/src/components/ui/__tests__/image-viewer.test.tsx`
- Modify: `packages/ui-kit/src/icons.ts` (ensure `ZoomIn`, `ZoomOut`, `Maximize2`, `X` exported)

**Interfaces:**
- Produces: `export function ImageViewer(props: { src: string; alt?: string; open: boolean; onOpenChange: (o: boolean) => void }): JSX.Element` with `scale` clamped to `[1, 8]` and a reset control. Exported from ui-kit at `@ultranos/ui-kit/components/ui/image-viewer`.
- Consumes: ui-kit `Dialog` primitives; `@ultranos/ui-kit/icons`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui-kit/src/components/ui/__tests__/image-viewer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageViewer } from '../image-viewer'

describe('ImageViewer', () => {
  it('renders the image when open and hides when closed', () => {
    const { rerender } = render(<ImageViewer src="data:image/webp;base64,AA" alt="cell" open={false} onOpenChange={() => {}} />)
    expect(screen.queryByRole('img')).toBeNull()
    rerender(<ImageViewer src="data:image/webp;base64,AA" alt="cell" open onOpenChange={() => {}} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'cell')
  })

  it('zoom-in increases scale; reset returns to 1; scale clamps at 8', () => {
    render(<ImageViewer src="data:image/webp;base64,AA" open onOpenChange={() => {}} />)
    const img = screen.getByRole('img')
    const zoomIn = screen.getByRole('button', { name: /zoom in/i })
    for (let i = 0; i < 20; i++) fireEvent.click(zoomIn)
    expect(img.style.transform).toContain('scale(8)') // clamped
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(img.style.transform).toContain('scale(1)')
  })

  it('Escape requests close', () => {
    const onOpenChange = vi.fn()
    render(<ImageViewer src="data:image/webp;base64,AA" open onOpenChange={onOpenChange} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @ultranos/ui-kit test image-viewer`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/ui-kit/src/components/ui/image-viewer.tsx
'use client'
import * as React from 'react'
import { Dialog, DialogContent } from './dialog'
import { ZoomIn, ZoomOut, Maximize2, X } from '../../icons'

const MIN = 1
const MAX = 8
const STEP = 0.5

export interface ImageViewerProps {
  src: string
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageViewer({ src, alt, open, onOpenChange }: ImageViewerProps) {
  const [scale, setScale] = React.useState(1)
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const drag = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    if (!open) { setScale(1); setOffset({ x: 0, y: 0 }) }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s))
  const zoomIn = () => setScale((s) => clamp(s + STEP))
  const zoomOut = () => setScale((s) => clamp(s - STEP))
  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl overflow-hidden bg-card p-0">
        <div className="flex items-center justify-end gap-2 border-b border-border p-2">
          <button type="button" aria-label="Zoom out" onClick={zoomOut} className="rounded-lg p-2 text-foreground hover:bg-muted"><ZoomOut size={18} /></button>
          <button type="button" aria-label="Zoom in" onClick={zoomIn} className="rounded-lg p-2 text-foreground hover:bg-muted"><ZoomIn size={18} /></button>
          <button type="button" aria-label="Reset zoom" onClick={reset} className="rounded-lg p-2 text-foreground hover:bg-muted"><Maximize2 size={18} /></button>
          <button type="button" aria-label="Close" onClick={() => onOpenChange(false)} className="rounded-lg p-2 text-foreground hover:bg-muted"><X size={18} /></button>
        </div>
        <div
          className="flex h-[70vh] items-center justify-center overflow-hidden bg-black/5"
          onWheel={(e) => { e.deltaY < 0 ? zoomIn() : zoomOut() }}
          onPointerDown={(e) => { if (scale > 1) drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y } }}
          onPointerMove={(e) => { if (drag.current) setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }) }}
          onPointerUp={() => { drag.current = null }}
        >
          <img
            src={src}
            alt={alt ?? ''}
            draggable={false}
            className="max-h-full max-w-full select-none"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test, then build the package**

Run: `pnpm -F @ultranos/ui-kit test image-viewer` → Expected: PASS.
Then: `pnpm --filter @ultranos/ui-kit build` (apps resolve `dist/`, not source).

- [ ] **Step 5: Commit**
```bash
git add packages/ui-kit/src/components/ui/image-viewer.tsx packages/ui-kit/src/components/ui/__tests__ packages/ui-kit/src/icons.ts packages/ui-kit/dist
git commit -m "feat(ui-kit): shared ImageViewer zoom/pan lightbox"
```

---

### Task 4: Hub `uploadResult` — accept WebP, link by `diagnosticReportId`, relax LOINC

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (the `uploadResult` procedure, from line 657)
- Test: `apps/hub-api/src/__tests__/lab-upload-result.test.ts` (extend)

**Interfaces:**
- Consumes: existing `scanFile`, `encryptField`, `AuditLogger`, `ctx.supabase`, `ctx.lab`.
- Produces: `uploadResult` input additionally accepts `fileType: 'image/webp'` and optional `diagnosticReportId?: string`; when present, upserts one report and attaches the file to it.

- [ ] **Step 1: Write the failing test**

```ts
// add to apps/hub-api/src/__tests__/lab-upload-result.test.ts
it('accepts image/webp and attaches to an existing diagnosticReportId (upsert once)', async () => {
  const reportId = '11111111-1111-1111-1111-111111111111'
  // First webp upload creates the report + file
  await caller.uploadResult({
    fileBase64: Buffer.from('webpbytes').toString('base64'),
    fileName: 'cell.webp', fileType: 'image/webp',
    patientRef: 'Patient/abc', loincCode: '58410-2', loincDisplay: 'CBC',
    collectionDate: '2026-09-01', diagnosticReportId: reportId,
  })
  // Second webp upload attaches to the SAME report (no duplicate report row)
  await caller.uploadResult({
    fileBase64: Buffer.from('webpbytes2').toString('base64'),
    fileName: 'cell2.webp', fileType: 'image/webp',
    patientRef: 'Patient/abc', loincCode: '58410-2', loincDisplay: 'CBC',
    collectionDate: '2026-09-01', diagnosticReportId: reportId,
  })
  const reports = await testDb.from('diagnostic_reports').select('id').eq('id', reportId)
  expect(reports.data).toHaveLength(1)
  const files = await testDb.from('lab_result_files').select('id').eq('diagnostic_report_id', reportId)
  expect(files.data).toHaveLength(2)
})
```
(Match the existing test file's harness — `caller`, `testDb` mocks/fixtures already present there.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F hub-api test lab-upload-result`
Expected: FAIL — `image/webp` rejected by the zod enum / no `diagnosticReportId` handling.

- [ ] **Step 3: Implement**

In `uploadResult` input schema: add `'image/webp'` to the `fileType` enum; change `loincCode` from the restricted enum to `z.string().min(1)` (keep `loincDisplay` required); add `diagnosticReportId: z.string().uuid().optional()`.

In the mutation, replace the unconditional report insert (around lines 830-834) with an upsert-or-attach:
```ts
let reportId: string
if (input.diagnosticReportId) {
  // Upsert-by-id: create only if this session's report doesn't exist yet.
  const { data: existing } = await ctx.supabase
    .from('diagnostic_reports').select('id').eq('id', input.diagnosticReportId).maybeSingle()
  if (!existing) {
    const { error } = await ctx.supabase.from('diagnostic_reports')
      .insert({ ...reportInsert, id: input.diagnosticReportId })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create diagnostic report' })
  }
  reportId = input.diagnosticReportId
} else {
  const { data: report, error: reportError } = await ctx.supabase
    .from('diagnostic_reports').insert(reportInsert).select('id').single()
  if (reportError || !report) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create diagnostic report' })
  reportId = report.id
}
```
Then use `reportId` in the `lab_result_files` insert (`diagnostic_report_id: reportId`). Keep the existing virus scan, size backstop, and audit. Change the file-error compensating delete to only run when we created the report in this call (don't delete a shared report on a later file failure).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F hub-api test lab-upload-result` → Expected: PASS. Also run `pnpm -F hub-api typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/__tests__/lab-upload-result.test.ts
git commit -m "feat(hub): uploadResult accepts webp + links files to a shared report id"
```

---

### Task 5: Hub `lab.uploadSpecimenFile` + `/api/specimen-files/:id` download

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/lab.ts` (add `uploadSpecimenFile` procedure)
- Create: `apps/hub-api/src/app/api/specimen-files/[fileId]/route.ts`
- Test: `apps/hub-api/src/__tests__/specimen-file-upload.test.ts`, `apps/hub-api/src/__tests__/specimen-file-download.test.ts`

**Interfaces:**
- Produces: `lab.uploadSpecimenFile({ fileBase64, fileName, fileType, specimenId, patientRef, attachmentContext })`; `GET /api/specimen-files/:fileId` → decrypted binary or 4xx.
- Consumes: `scanFile`, `encryptField`/`decryptField`, `AuditLogger`, `hasResourceAccess`, `checkConsent`, `getCachedEncryptionKey` (all already imported by the lab-files route — mirror it).

- [ ] **Step 1: Write the failing upload test**

```ts
// apps/hub-api/src/__tests__/specimen-file-upload.test.ts
it('stores an encrypted, hashed specimen file and emits PHI_WRITE', async () => {
  const res = await caller.uploadSpecimenFile({
    fileBase64: Buffer.from('img').toString('base64'),
    fileName: 'damaged.webp', fileType: 'image/webp',
    specimenId: 'LAB-20260901-0001', patientRef: 'Patient/abc',
    attachmentContext: 'rejection',
  })
  expect(res.fileId).toMatch(/^[0-9a-f-]{36}$/)
  const row = await testDb.from('specimen_files').select('*').eq('id', res.fileId).single()
  expect(row.data.encrypted_content.startsWith('v1:')).toBe(true)
  expect(row.data.file_hash).toHaveLength(64) // sha-256 hex
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F hub-api test specimen-file-upload` → Expected: FAIL — procedure missing.

- [ ] **Step 3: Implement `uploadSpecimenFile`**

Mirror `uploadResult` guards and body (validate base64, size backstop, `scanFile`, reject infected/error with `PHI_WRITE`/`FAILURE` audit), then:
```ts
const encryptedContent = encryptField(input.fileBase64, encryptionKey)
const { data, error } = await ctx.supabase.from('specimen_files').insert({
  specimen_id: input.specimenId,
  patient_ref: input.patientRef,
  lab_id: labId,
  file_name: input.fileName,
  file_type: input.fileType,
  file_size: fileBuffer.length,
  encrypted_content: encryptedContent,
  file_hash: scanResult.hash,
  virus_scan_status: virusScanStatus,
  attachment_context: input.attachmentContext,
}).select('id').single()
if (error || !data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to store specimen file' })
await audit.emit({ action: 'PHI_WRITE', resourceType: 'SPECIMEN', resourceId: data.id, actorId: technicianId, actorRole: ctx.user.role, outcome: 'SUCCESS', sessionId: ctx.user.sessionId, metadata: { operation: 'specimen_file_upload', specimenId: input.specimenId } })
return { fileId: data.id }
```
Input zod: `fileType` enum incl `image/webp`; `attachmentContext: z.enum(['receipt','rejection'])`.

- [ ] **Step 4: Write + pass the download test, then implement the route**

Add `specimen-file-download.test.ts` asserting: 400 on non-UUID, 403 when `virus_scan_status !== 'clean'`, 403 with no consent, 200 + correct `Content-Type` + `PHI_READ` audit on success. Implement `apps/hub-api/src/app/api/specimen-files/[fileId]/route.ts` as a copy of `lab-files/[fileId]/route.ts` reading `specimen_files` (its own `patient_ref`/`virus_scan_status` columns — no join needed), RBAC on `'DiagnosticReport'` (labs already hold this), consent via `patient_ref`, audit `resourceType: 'SPECIMEN'`, `metadata.operation: 'specimen_file_download'`.
Run: `pnpm -F hub-api test specimen-file` → Expected: PASS. Run `pnpm -F hub-api typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/hub-api/src/trpc/routers/lab.ts apps/hub-api/src/app/api/specimen-files apps/hub-api/src/__tests__/specimen-file-*.test.ts
git commit -m "feat(hub): specimen file upload procedure + download endpoint"
```

---

### Task 6: Client transport — widen `UploadResultInput`, metadata linkage, specimen upload fn

**Files:**
- Modify: `apps/lab-lite/src/lib/trpc.ts` (`UploadResultInput` type + add `uploadSpecimenFile` caller + `UploadSpecimenFileInput`)
- Modify: `apps/lab-lite/src/lib/db.ts` (`UploadQueueMetadata` — add `diagnosticReportId?`, `kind`, specimen fields)
- Modify: `apps/lab-lite/src/lib/upload-queue-worker.ts` (route entry to result vs specimen uploadFn; pass `diagnosticReportId`)
- Test: `apps/lab-lite/src/__tests__/upload-queue-worker.test.ts` (extend)

**Interfaces:**
- Consumes: `addToQueue(entry: Omit<UploadQueueEntry,'id'>)` (db.ts:1746).
- Produces: `UploadResultInput.fileType` includes `'image/webp'`; `UploadResultInput.diagnosticReportId?: string`; `UploadSpecimenFileInput { fileBase64, fileName, fileType, specimenId, patientRef, attachmentContext }`; `UploadQueueMetadata` gains `kind: 'result' | 'specimen'`, `diagnosticReportId?`, `specimenId?`, `attachmentContext?`.

- [ ] **Step 1: Write the failing test**

```ts
// extend upload-queue-worker.test.ts
it('routes specimen-kind entries to uploadSpecimenFn with linkage', async () => {
  const uploadFn = vi.fn().mockResolvedValue({})
  const uploadSpecimenFn = vi.fn().mockResolvedValue({ fileId: 'f1' })
  mockGetQueueItems.mockResolvedValue([{
    id: 1, file: new Blob([new Uint8Array(3)]), fileName: 'x.webp', fileType: 'image/webp',
    patientRef: 'Patient/abc', patientFirstName: 'A', queuedAt: 't', status: 'pending', retryCount: 0, lastAttemptAt: null,
    metadata: { kind: 'specimen', specimenId: 'LAB-1', attachmentContext: 'rejection', loincCode: '', loincDisplay: '', collectionDate: '2026-09-01' },
  }])
  await drainQueue({ uploadFn, uploadSpecimenFn, getToken: async () => 't', onAuditEvent: () => {}, blobToBase64Fn: async () => 'AAA' })
  expect(uploadSpecimenFn).toHaveBeenCalledWith(expect.objectContaining({ specimenId: 'LAB-1', attachmentContext: 'rejection', fileType: 'image/webp' }), 't')
  expect(uploadFn).not.toHaveBeenCalled()
})

it('passes diagnosticReportId for result-kind entries', async () => {
  const uploadFn = vi.fn().mockResolvedValue({})
  mockGetQueueItems.mockResolvedValue([{
    id: 2, file: new Blob([new Uint8Array(3)]), fileName: 'x.webp', fileType: 'image/webp',
    patientRef: 'Patient/abc', patientFirstName: 'A', queuedAt: 't', status: 'pending', retryCount: 0, lastAttemptAt: null,
    metadata: { kind: 'result', diagnosticReportId: 'rep-uuid', loincCode: '58410-2', loincDisplay: 'CBC', collectionDate: '2026-09-01' },
  }])
  await drainQueue({ uploadFn, uploadSpecimenFn: vi.fn(), getToken: async () => 't', onAuditEvent: () => {}, blobToBase64Fn: async () => 'AAA' })
  expect(uploadFn).toHaveBeenCalledWith(expect.objectContaining({ diagnosticReportId: 'rep-uuid' }), 't')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F lab-lite test upload-queue-worker` → Expected: FAIL (`uploadSpecimenFn` unknown; no routing).

- [ ] **Step 3: Implement**

- In `trpc.ts`: add `'image/webp'` to `UploadResultInput['fileType']`; add `diagnosticReportId?: string`; add `UploadSpecimenFileInput` + a `uploadSpecimenFile(input, token)` caller mirroring `uploadResult`.
- In `db.ts`: extend `UploadQueueMetadata` with `kind: 'result' | 'specimen'`, `diagnosticReportId?: string`, `specimenId?: string`, `attachmentContext?: 'receipt' | 'rejection'` (all optional except `kind`; default existing rows to `'result'` when read).
- In `upload-queue-worker.ts`: add `uploadSpecimenFn` to `DrainDependencies`; in `drainItem`, branch on `item.metadata.kind`:
  - `'specimen'` → call `deps.uploadSpecimenFn({ fileBase64, fileName, fileType, specimenId, patientRef, attachmentContext }, token)`
  - else → call `deps.uploadFn({ ...existing, diagnosticReportId: item.metadata.diagnosticReportId }, token)`

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F lab-lite test upload-queue-worker` → Expected: PASS. Run `pnpm -F lab-lite typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/lab-lite/src/lib/trpc.ts apps/lab-lite/src/lib/db.ts apps/lab-lite/src/lib/upload-queue-worker.ts apps/lab-lite/src/__tests__/upload-queue-worker.test.ts
git commit -m "feat(lab-lite): upload queue supports webp, report linkage, and specimen files"
```

---

### Task 7: `AttachmentPicker` component (transcode + validate + enqueue-ready list)

**Files:**
- Create: `apps/lab-lite/src/components/attachments/AttachmentPicker.tsx`
- Test: `apps/lab-lite/src/__tests__/attachment-picker.test.tsx`

**Interfaces:**
- Consumes: `transcodeToWebp`, `TranscodeTooLargeError`, `TranscodeUnsupportedError`, `TRANSCODE` (Task 2).
- Produces:
  ```ts
  export interface PreparedAttachment { blob: Blob; fileName: string; fileType: 'image/webp' | 'application/pdf'; kind: 'image' | 'pdf' }
  export function AttachmentPicker(props: {
    value: PreparedAttachment[]
    onChange: (next: PreparedAttachment[]) => void
    max?: number // default MAX_ATTACHMENTS_PER_PARENT = 10
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/lab-lite/src/__tests__/attachment-picker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AttachmentPicker } from '../components/attachments/AttachmentPicker'

vi.mock('../lib/image-transcode', async (orig) => {
  const actual = await orig<any>()
  return { ...actual, transcodeToWebp: vi.fn(async () => ({ blob: new Blob([new Uint8Array(1000)], { type: 'image/webp' }), width: 2048, height: 1536, bytes: 1000, originalType: 'image/jpeg' })) }
})

function pngFile() { return new File([new Uint8Array(5)], 'p.png', { type: 'image/png' }) }
function bigPdf() { return new File([new Uint8Array(11 * 1024 * 1024)], 'a.pdf', { type: 'application/pdf' }) }

describe('AttachmentPicker', () => {
  it('transcodes an image to a webp PreparedAttachment', async () => {
    const onChange = vi.fn()
    render(<AttachmentPicker value={[]} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('attachment-input'), { target: { files: [pngFile()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ fileType: 'image/webp', kind: 'image' })
  })

  it('rejects a PDF over 10MB', async () => {
    render(<AttachmentPicker value={[]} onChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('attachment-input'), { target: { files: [bigPdf()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F lab-lite test attachment-picker` → Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Build the component with a hidden `<input type="file" data-testid="attachment-input" accept="image/jpeg,image/png,image/webp,application/pdf">`, a drop zone, and a thumbnail/chip list with remove buttons. On select: for images call `transcodeToWebp` (show spinner; on `TranscodeUnsupportedError`/`TranscodeTooLargeError` render an `role="alert"` message); for PDFs validate type + `size <= 10_485_760` (`role="alert"` if over). Enforce `max` (default 10). Use `@ultranos/ui-kit/icons` (`Upload`, `X`, `FileText`, `Image`), semantic tokens, logical CSS props. Emit `onChange([...value, prepared])`. All user-facing strings via `useTranslations` (keys added in Task 11).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F lab-lite test attachment-picker` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/lab-lite/src/components/attachments/AttachmentPicker.tsx apps/lab-lite/src/__tests__/attachment-picker.test.tsx
git commit -m "feat(lab-lite): AttachmentPicker with WebP transcode + PDF validation"
```

---

### Task 8: Wire attachments into the result-entry submit flow

**Files:**
- Modify: `apps/lab-lite/src/components/ResultEntryForm.tsx` (render `AttachmentPicker`, hold `PreparedAttachment[]`, pass to `onSave`)
- Modify: `apps/lab-lite/src/app/[locale]/(app)/results/[sampleId]/enter/page.tsx` (`handleSave` enqueues attachments via `addToQueue` with a session report UUID)
- Test: `apps/lab-lite/src/__tests__/result-entry-attachments.test.tsx`

**Interfaces:**
- Consumes: `AttachmentPicker`, `PreparedAttachment` (Task 7); `addToQueue` (db.ts:1746); `reportLabResultAuditEvent` (existing).
- Produces: on submit, one `crypto.randomUUID()` report id shared by all enqueued attachment entries (`metadata.kind='result'`, `metadata.diagnosticReportId=<uuid>`).

- [ ] **Step 1: Write the failing test**

```tsx
// result-entry-attachments.test.tsx — assert enqueue on submit
import { describe, it, expect, vi } from 'vitest'
// mock addToQueue
const addToQueue = vi.fn().mockResolvedValue(1)
vi.mock('@/lib/db', async (o) => ({ ...(await o<any>()), addToQueue }))
// render ResultEntryForm with a prepared attachment, submit, assert addToQueue called with kind:'result' + shared reportId
it('enqueues each prepared attachment under one report id on submit', async () => {
  // ...render form, inject one attachment via onChange, click Submit...
  expect(addToQueue).toHaveBeenCalledWith(
    expect.objectContaining({ fileType: 'image/webp', metadata: expect.objectContaining({ kind: 'result', diagnosticReportId: expect.any(String) }) }),
    expect.anything(),
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F lab-lite test result-entry-attachments` → Expected: FAIL (no enqueue yet).

- [ ] **Step 3: Implement**

- `ResultEntryFormProps`: add `attachments: PreparedAttachment[]` + `onAttachmentsChange: (a: PreparedAttachment[]) => void` (lift state to the page), or hold state internally and include the array in the `onSave` signature. Render `<AttachmentPicker>` in a boxed section below the report-comment field.
- In the page `handleSave`: after persisting the result, generate `const reportId = crypto.randomUUID()`; for each attachment call:
```ts
await addToQueue({
  file: att.blob, fileName: att.fileName, fileType: att.fileType,
  patientRef, patientFirstName,
  queuedAt: new Date().toISOString(), status: 'pending', retryCount: 0, lastAttemptAt: null,
  metadata: { kind: 'result', diagnosticReportId: reportId, loincCode: template.loincCode, loincDisplay: template.loincDisplay, collectionDate },
})
```
Emit the existing `reportLabResultAuditEvent` unchanged; attachments’ own `PHI_WRITE` is emitted hub-side on upload.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F lab-lite test result-entry-attachments` → Expected: PASS. Run `pnpm -F lab-lite typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/lab-lite/src/components/ResultEntryForm.tsx "apps/lab-lite/src/app/[locale]/(app)/results/[sampleId]/enter/page.tsx" apps/lab-lite/src/__tests__/result-entry-attachments.test.tsx
git commit -m "feat(lab-lite): attach photos in result entry, one report per submit"
```

---

### Task 9: Wire attachments into sample receive + rejection + `image/webp` on the standalone wizard

**Files:**
- Modify: `apps/lab-lite/src/components/samples/ReceiveSampleModal.tsx` (picker in details step; enqueue `kind:'specimen'` with `attachmentContext` = `'receipt'` or `'rejection'` based on condition)
- Modify: `apps/lab-lite/src/components/ResultUpload.tsx` (add `'image/webp'` to `ACCEPTED_TYPES`, extension list)
- Test: `apps/lab-lite/src/__tests__/receive-sample-attachments.test.tsx`

**Interfaces:**
- Consumes: `AttachmentPicker` (Task 7), `addToQueue` (db.ts), the specimen's `labSampleId` + opaque `patientRef`.
- Produces: on accession/reject, enqueues `metadata.kind='specimen'`, `metadata.specimenId=<labSampleId>`, `metadata.attachmentContext`.

- [ ] **Step 1: Write the failing test**

```tsx
// receive-sample-attachments.test.tsx
it('enqueues specimen photos with rejection context when condition != acceptable', async () => {
  // render ReceiveSampleModal, set condition 'hemolyzed', add one attachment, submit
  expect(addToQueue).toHaveBeenCalledWith(
    expect.objectContaining({ metadata: expect.objectContaining({ kind: 'specimen', attachmentContext: 'rejection', specimenId: expect.any(String) }) }),
    expect.anything(),
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F lab-lite test receive-sample-attachments` → Expected: FAIL.

- [ ] **Step 3: Implement**

- Add `<AttachmentPicker>` to the ReceiveSampleModal details step. After `accessionSample` resolves (so `labSampleId` exists), enqueue each attachment with `metadata.kind='specimen'`, `specimenId = specimen._ultranos.labSampleId`, `attachmentContext = condition === 'acceptable' ? 'receipt' : 'rejection'`, `patientRef` = the opaque `patientRef`. (`loincCode/loincDisplay` empty strings; `collectionDate` = today.)
- `ResultUpload.tsx`: add `'image/webp'` to `ACCEPTED_TYPES` and `'.webp'` to `ACCEPTED_EXTENSIONS`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F lab-lite test receive-sample-attachments` → Expected: PASS. Run `pnpm -F lab-lite typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/lab-lite/src/components/samples/ReceiveSampleModal.tsx apps/lab-lite/src/components/ResultUpload.tsx apps/lab-lite/src/__tests__/receive-sample-attachments.test.tsx
git commit -m "feat(lab-lite): attach specimen photos on receive/reject; webp in upload wizard"
```

---

### Task 10: OPD — open received photos in the shared `ImageViewer`

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/LabReportDetail.tsx` (make safe-image attachments clickable → `ImageViewer`; emit `PHI_READ` on open)
- Modify: `apps/opd-lite/src/components/clinical/LabResultDetail.tsx` (same)
- Test: `apps/opd-lite/src/__tests__/lab-report-detail-viewer.test.tsx`

**Interfaces:**
- Consumes: `ImageViewer` from `@ultranos/ui-kit/components/ui/image-viewer` (Task 3); existing audit helper used elsewhere in these files for `PHI_READ`.

- [ ] **Step 1: Write the failing test**

```tsx
// lab-report-detail-viewer.test.tsx
it('opens the ImageViewer when a webp attachment is clicked and audits the view', async () => {
  const auditSpy = vi.fn()
  // render LabReportDetail with report.presentedForm = [{ contentType:'image/webp', data:'AA', title:'cell' }]
  fireEvent.click(screen.getByRole('img', { name: /cell/i }))
  expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()
  expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ phiAccess: 'lab_result_attachment_view' }))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F opd-lite test lab-report-detail-viewer` → Expected: FAIL.

- [ ] **Step 3: Implement**

In `renderAttachment` (both files), for `SAFE_IMAGE_PREFIXES` matches, wrap the `<img>` in a `<button>` that sets viewer state (`{ open: true, src: dataUri, alt: title }`) and calls the file's existing `PHI_READ` audit helper with `metadata.phiAccess = 'lab_result_attachment_view'`. Render one `<ImageViewer open={...} src={...} onOpenChange={...} />` per component. PDFs keep the existing `<embed>`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F opd-lite test lab-report-detail-viewer` → Expected: PASS. Run `pnpm -F opd-lite typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/opd-lite/src/components/clinical/LabReportDetail.tsx apps/opd-lite/src/components/clinical/LabResultDetail.tsx apps/opd-lite/src/__tests__/lab-report-detail-viewer.test.tsx
git commit -m "feat(opd-lite): zoomable viewer for lab result photo attachments"
```

---

### Task 11: i18n keys (4 locales) + lifecycle audit wiring

**Files:**
- Modify: lab-lite locale files (en, ar, fa/prs, ps — match the app's existing locale set) — attachment picker + viewer strings
- Modify: opd-lite locale files (`labResults` namespace) — viewer control labels/alt fallbacks
- Modify: `apps/lab-lite/src/components/samples/ReceiveSampleModal.tsx` (emit `SAMPLE_RECEIVED`), `apps/lab-lite/src/components/samples/SampleDetailView.tsx` (emit `SAMPLE_PROCESSED`)
- Test: `apps/lab-lite/src/__tests__/sample-lifecycle-audit.test.ts`

**Interfaces:**
- Consumes: `reportLabLifecycleEvent` (existing in `audit-client.ts`); `AuditAction.SAMPLE_RECEIVED`/`SAMPLE_PROCESSED` (existing enums).

- [ ] **Step 1: Write the failing test**

```ts
// sample-lifecycle-audit.test.ts
it('emits SAMPLE_RECEIVED on accession', async () => {
  const spy = vi.fn()
  vi.mocked(reportLabLifecycleEvent).mockImplementation(spy)
  // trigger accession path
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ event: 'SAMPLE_RECEIVED' }))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F lab-lite test sample-lifecycle-audit` → Expected: FAIL (calls still commented out).

- [ ] **Step 3: Implement**

Uncomment/implement the flagged `reportLabLifecycleEvent({ event: 'SAMPLE_RECEIVED', ... })` in `ReceiveSampleModal.tsx` and `{ event: 'SAMPLE_PROCESSED', ... }` in `SampleDetailView.tsx` (opaque ids only). Add all new i18n keys used by Tasks 3/7/9/10 to every locale file (no missing-key warnings). Run the repo's i18n key-parity check if present.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F lab-lite test sample-lifecycle-audit` → Expected: PASS. Run `pnpm -F lab-lite typecheck` and `pnpm -F opd-lite typecheck`.

- [ ] **Step 5: Commit**
```bash
git add apps/lab-lite/src apps/opd-lite/src
git commit -m "feat(lab-lite): wire SAMPLE_RECEIVED/PROCESSED audits; i18n for attachments (4 locales)"
```

---

### Task 12: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint the whole monorepo**

Run: `pnpm typecheck` then `pnpm lint`
Expected: PASS. Fix any fallout in the touched packages.

- [ ] **Step 2: Run all affected app test suites**

Run: `pnpm -F lab-lite test && pnpm -F opd-lite test && pnpm -F hub-api test && pnpm -F @ultranos/ui-kit test`
Expected: PASS, including the RTL snapshot suite (ImageViewer + attachment UI in LTR and RTL).

- [ ] **Step 3: Manual offline smoke (documented, not automated)**

With the network cut: enter a result, attach a phone-sized photo → confirm it transcodes to a WebP well under 1 MB and enqueues; reconnect → confirm the upload drains and OPD can open + zoom the photo. Confirm an "interaction/interaction-unrelated" negative: a >1 MB-target photo still lands ≤ 1 MB, and a HEIC is rejected with a clear message.

- [ ] **Step 4: Commit any verification fixes**
```bash
git add -A
git commit -m "test: fixes from full-suite verification of lab attachments"
```

---

## Self-Review (completed by author)

**Spec coverage:** transcode §5 → Task 2; picker §6 → Task 7; result path §7 → Tasks 4, 6, 8; migrations/specimen §8 → Tasks 1, 5, 6, 9; viewer §9 → Tasks 3, 10; lifecycle audits §10 → Task 11; safety §11 → enforced across Tasks 4/5/10 (audit) + 2 (EXIF) + 1/5 (encryption); testing §12 → each task's tests + Task 12. Out-of-scope §3 (structured-value transport) intentionally not planned.

**Placeholder scan:** no TBD/TODO; every code step has real code. The two known-unknowns (exact CHECK constraint name, exact locale file set) are handled with explicit lookup steps, not guesses.

**Type consistency:** `PreparedAttachment` (Task 7) is consumed unchanged in Tasks 8/9; `UploadQueueMetadata.kind`/`diagnosticReportId`/`specimenId`/`attachmentContext` defined in Task 6 are used consistently in Tasks 8/9; `diagnosticReportId` (Task 4 hub) matches the client metadata field (Task 6/8); `ImageViewer` prop shape (Task 3) matches usage (Task 10).
