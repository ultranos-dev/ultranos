# Patient Photo Upload Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chart's crude immediate photo upload with a complete, design-system modal (source pick → live webcam/file → crop → server-side Sharp WebP re-encode → Storage), plus photo removal.

**Architecture:** Extract a headless `PhotoCropper` shared by registration and the new chart modal. The chart modal drives a step machine and calls a new authenticated Hub REST route that runs Sharp (WebP, 512px cap, EXIF-stripped), uploads to Supabase Storage, sets `patients.photo_url`, and audits — one atomic server action. Client updates local Dexie only after a 200.

**Tech Stack:** Next.js 15 (opd-lite PWA + hub-api Node), TypeScript, React, Vitest, ShadCN/ui-kit, Supabase Storage, Sharp, `getUserMedia`.

## Global Constraints

- Sharp runs **only** on hub-api (native Node lib; not browser, not Deno Edge Functions).
- Encode preset: cap longest side **512px**, **WebP quality 80**, metadata stripped.
- Storage bucket `patient-photos`; object key `<patientId>.webp`; `patients.photo_url` stores the **key**, not a URL.
- Hub write is source of truth — Dexie/UI update **only after** HTTP 200. Never optimistic-then-diverge.
- Every photo upload/remove emits a server-side audit event (`AuditLogger`, `PHI_WRITE`, `resourceType: 'PATIENT'`).
- All Hub calls carry `Authorization: Bearer <token>` via `getAuthHeaders()` from `apps/opd-lite/src/lib/hub-auth.ts`.
- Import ShadCN components from `@ultranos/ui-kit/components/ui/<name>`; icons from `@ultranos/ui-kit/icons`; Button from `@/components/ui/Button`.
- i18n: patient-facing strings under a new `patientPhoto` namespace in `en`/`ar`/`prs`/`ps`.
- Offline: photo changes require the Hub; not queued. Disable actions when `!navigator.onLine`.
- No autonomous git commits beyond the per-task commit steps below (which the executor performs with the user's standing approval to follow this plan).

---

### Task 1: Extract headless `PhotoCropper`; refactor registration `PhotoCropModal` to use it

**Files:**
- Create: `apps/opd-lite/src/components/patient/PhotoCropper.tsx`
- Modify: `apps/opd-lite/src/components/registration/PhotoCropModal.tsx` (full rewrite of body; keep same props/exports)
- Test: `apps/opd-lite/src/__tests__/photo-cropper.test.tsx`

**Interfaces:**
- Produces:
  - `export interface PhotoCropperHandle { crop: () => void }`
  - `export const PhotoCropper: React.ForwardRefExoticComponent<PhotoCropperProps & React.RefAttributes<PhotoCropperHandle>>`
  - `interface PhotoCropperProps { rawDataUrl: string | null; onCropped: (dataUrl: string) => void }`
- `PhotoCropModal` keeps its existing public interface: `{ open: boolean; rawDataUrl: string | null; onConfirm: (croppedDataUrl: string) => void; onCancel: () => void }`.

`PhotoCropper` contains the viewport + zoom + all pan/zoom/pinch logic and its own size-limit error. It exposes `crop()` via ref; parents render their own footer/title and call `ref.current.crop()`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/opd-lite/src/__tests__/photo-cropper.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { PhotoCropper, type PhotoCropperHandle } from '@/components/patient/PhotoCropper'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))

// jsdom canvas → deterministic data URL
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,QUJD') // "ABC"
})

describe('PhotoCropper', () => {
  it('exposes crop() via ref and emits a cropped data URL', () => {
    const ref = createRef<PhotoCropperHandle>()
    const onCropped = vi.fn()
    render(<PhotoCropper ref={ref} rawDataUrl="data:image/png;base64,AAAA" onCropped={onCropped} />)
    ref.current!.crop()
    expect(onCropped).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg/))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/photo-cropper.test.tsx`
Expected: FAIL — cannot resolve `@/components/patient/PhotoCropper`.

- [ ] **Step 3: Create `PhotoCropper.tsx`**

Create the file by moving the crop engine out of the current `PhotoCropModal.tsx`. Copy **verbatim** from the existing `apps/opd-lite/src/components/registration/PhotoCropModal.tsx` these pieces into the new file: the `Constants` block (`MAX_BYTES`…`CORNER`, lines 14–22), the `Transform` interface + `clampPan` helper (lines 26–48), and inside the component **all** state/refs/effects/handlers (lines 54–223: `naturalSize`, `minZoom`, `transform`, drag/touch/pinch, wheel effect, `applyZoomFromCenter`), the `handleConfirm` crop-export (lines 227–259), the zoom-percentage derivation (lines 263–264), and the viewport + zoom-slider + error JSX (lines 291–404). Wrap as a `forwardRef` exposing `crop`. Full new file:

```tsx
// apps/opd-lite/src/components/patient/PhotoCropper.tsx
'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ZoomIn, ZoomOut, AlertCircle } from '@ultranos/ui-kit/icons'

// ── Constants (verbatim from prior PhotoCropModal) ─────────────────────────────
const MAX_BYTES = 1024 * 1024
const VIEWPORT = 300
const FRAME = 240
const MARGIN = (VIEWPORT - FRAME) / 2
const OUTPUT = 512
const MAX_ZOOM = 5
const CORNER = 18

interface Transform { zoom: number; panX: number; panY: number }

export interface PhotoCropperHandle { crop: () => void }
interface PhotoCropperProps {
  rawDataUrl: string | null
  onCropped: (dataUrl: string) => void
}

function clampPan(panX: number, panY: number, zoom: number, nw: number, nh: number): { x: number; y: number } {
  const imgW = nw * zoom
  const imgH = nh * zoom
  return {
    x: Math.min(MARGIN, Math.max(MARGIN + FRAME - imgW, panX)),
    y: Math.min(MARGIN, Math.max(MARGIN + FRAME - imgH, panY)),
  }
}

export const PhotoCropper = forwardRef<PhotoCropperHandle, PhotoCropperProps>(
  function PhotoCropper({ rawDataUrl, onCropped }, ref) {
    const t = useTranslations('registration')
    const imgRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 })
    const [minZoom, setMinZoom] = useState(1)
    const [transform, setTransform] = useState<Transform>({ zoom: 1, panX: MARGIN, panY: MARGIN })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ clientX: 0, clientY: 0, panX: MARGIN, panY: MARGIN })
    const [error, setError] = useState('')

    const transformRef = useRef(transform)
    const minZoomRef = useRef(minZoom)
    const naturalSizeRef = useRef(naturalSize)
    useEffect(() => { transformRef.current = transform }, [transform])
    useEffect(() => { minZoomRef.current = minZoom }, [minZoom])
    useEffect(() => { naturalSizeRef.current = naturalSize }, [naturalSize])
    const lastPinchDist = useRef<number | null>(null)

    // Init on new image — COPY VERBATIM from prior PhotoCropModal lines 77-100
    // (the useEffect that loads the image, computes minZoom, centres, clamps).
    useEffect(() => {
      if (!rawDataUrl) return
      setError('')
      const img = new Image()
      img.onload = () => {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        setNaturalSize({ w: nw, h: nh })
        const z = Math.max(FRAME / nw, FRAME / nh)
        setMinZoom(z)
        const imgW = nw * z
        const imgH = nh * z
        const centreX = MARGIN + (FRAME - imgW) / 2
        const centreY = MARGIN + (FRAME - imgH) / 2
        const clamped = clampPan(centreX, centreY, z, nw, nh)
        setTransform({ zoom: z, panX: clamped.x, panY: clamped.y })
      }
      img.src = rawDataUrl
    }, [rawDataUrl])

    // Native wheel + touchmove, mouse drag, touch drag+pinch, applyZoomFromCenter:
    // COPY VERBATIM from prior PhotoCropModal lines 104-223.
    // (handleMouseDown/Move, stopDrag, handleTouchStart/End, handleTouchMoveReact,
    //  the wheel/touchmove effect, applyZoomFromCenter.)

    const handleConfirm = useCallback(() => {
      const img = imgRef.current
      if (!img) return
      const { zoom, panX, panY } = transformRef.current
      const srcX = (MARGIN - panX) / zoom
      const srcY = (MARGIN - panY) / zoom
      const srcSize = FRAME / zoom
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT)
      let quality = 0.92
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      while ((dataUrl.length - 23) * 0.75 > MAX_BYTES && quality > 0.3) {
        quality -= 0.05
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      if ((dataUrl.length - 23) * 0.75 > MAX_BYTES) {
        setError(t('photoCropSizeError'))
        return
      }
      onCropped(dataUrl)
    }, [onCropped, t])

    useImperativeHandle(ref, () => ({ crop: handleConfirm }), [handleConfirm])

    const zoomRange = MAX_ZOOM - minZoom
    const zoomPct = zoomRange > 0 ? Math.round(((transform.zoom - minZoom) / zoomRange) * 100) : 0

    // Viewport + zoom-slider + error JSX: COPY VERBATIM from prior PhotoCropModal
    // lines 291-404 (the crop viewport div through the error block). Paste here.
    return (
      <>
        {/* PASTE: crop viewport block (lines 292-364) */}
        {/* PASTE: zoom slider block (lines 366-396) */}
        {/* PASTE: error block (lines 398-404) */}
      </>
    )
  },
)
```

> Implementer note: the three "COPY VERBATIM"/"PASTE" regions are mechanical moves of existing, working code — do not rewrite them. Keep `imgRef`/`containerRef` names identical so the pasted JSX/handlers resolve. The `applyZoomFromCenter`/drag/pinch handlers reference `minZoom`, `naturalSize`, `transform`, `dragStart`, `isDragging` — all declared above.

- [ ] **Step 4: Rewrite `PhotoCropModal.tsx` to consume `PhotoCropper`**

```tsx
// apps/opd-lite/src/components/registration/PhotoCropModal.tsx
'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from '@ultranos/ui-kit/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ultranos/ui-kit/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { PhotoCropper, type PhotoCropperHandle } from '@/components/patient/PhotoCropper'

interface PhotoCropModalProps {
  open: boolean
  rawDataUrl: string | null
  onConfirm: (croppedDataUrl: string) => void
  onCancel: () => void
}

export function PhotoCropModal({ open, rawDataUrl, onConfirm, onCancel }: PhotoCropModalProps) {
  const t = useTranslations('registration')
  const cropperRef = useRef<PhotoCropperHandle>(null)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-sm w-full gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t('photoCropTitle')}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="flex gap-2.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">{t('photoCropGuidelinesTitle')}</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                <li className="flex gap-1.5"><span className="mt-px opacity-50">•</span>{t('photoCropGuide1')}</li>
                <li className="flex gap-1.5"><span className="mt-px opacity-50">•</span>{t('photoCropGuide2')}</li>
                <li className="flex gap-1.5"><span className="mt-px opacity-50">•</span>{t('photoCropGuide3')}</li>
              </ul>
              <p className="text-xs text-muted-foreground/70 mt-1.5 font-medium">{t('photoCropSizeLimit')}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center px-5">
          <PhotoCropper ref={cropperRef} rawDataUrl={rawDataUrl} onCropped={onConfirm} />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="outline" type="button" onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" type="button" onClick={() => cropperRef.current?.crop()}>
            {t('photoCropConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

> The viewport JSX moved into `PhotoCropper` includes the outer centering `<div className="flex justify-center px-5">` in the original; here that wrapper stays in the modal and `PhotoCropper` returns the inner viewport + zoom + error. Ensure no duplicate `flex justify-center` wrapper — the pasted region in `PhotoCropper` should start at the `<div ref={containerRef} …>` viewport, not the outer centering div.

- [ ] **Step 5: Run tests**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/photo-cropper.test.tsx`
Expected: PASS.

Run any existing registration/photo tests to confirm no regression:
Run: `pnpm -F opd-lite exec vitest run src/__tests__/registration.test.tsx 2>/dev/null || echo "no registration test file"`
Expected: PASS or "no registration test file".

- [ ] **Step 6: Typecheck touched files**

Run: `pnpm -F opd-lite exec tsc --noEmit 2>&1 | grep -E "PhotoCropper|PhotoCropModal" || echo "CLEAN"`
Expected: `CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/components/patient/PhotoCropper.tsx \
        apps/opd-lite/src/components/registration/PhotoCropModal.tsx \
        apps/opd-lite/src/__tests__/photo-cropper.test.tsx
git commit -m "refactor(opd-lite): extract headless PhotoCropper shared by crop modals"
```

---

### Task 2: Hub API `POST`/`DELETE /api/patient-photo` with Sharp WebP conversion

**Files:**
- Modify: `apps/hub-api/package.json` (add `sharp`)
- Create: `apps/hub-api/src/app/api/patient-photo/route.ts`
- Test: `apps/hub-api/src/__tests__/patient-photo-route.test.ts`

**Interfaces:**
- Produces HTTP:
  - `POST /api/patient-photo` — multipart form-data: `file` (Blob), `patientId` (uuid string), `lastKnownUpdate` (ISO string). Returns `200 { photoUrl: string; lastUpdated: string }`. Errors: 400 (bad input/type), 401 (no/invalid bearer), 403 (RBAC), 404 (patient), 409 (stale `lastKnownUpdate`), 500.
  - `DELETE /api/patient-photo` — JSON body `{ patientId: string; lastKnownUpdate: string }`. Returns `200 { photoUrl: null; lastUpdated: string }`. Same error set.
- Consumes (existing hub-api modules): `getSupabaseClient` from `@/lib/supabase`, `db` from `@/lib/supabase`, `verifySupabaseJwt`/`getSupabaseJwk` from `@/lib/jwt`, `hasResourceAccess` from `@/trpc/rbac`, `AuditLogger` from `@ultranos/audit-logger`.

- [ ] **Step 1: Add Sharp dependency**

```bash
pnpm -F hub-api add sharp
```
Expected: `sharp` appears under `dependencies` in `apps/hub-api/package.json`.

- [ ] **Step 2: Write the failing test**

```ts
// apps/hub-api/src/__tests__/patient-photo-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

// ---- Mocks (declare before importing the route) ----
const single = vi.fn()
const updateSelect = vi.fn()
const storageUpload = vi.fn()
const auditEmit = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: updateSelect }) }) }),
    }),
    storage: { from: () => ({ upload: storageUpload, remove: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
  db: { toRow: (o: Record<string, unknown>) => o },
}))
vi.mock('@/lib/jwt', () => ({
  getSupabaseJwk: () => ({ _marker: true }),
  verifySupabaseJwt: vi.fn(async (token: string) => {
    if (token === 'good') return { sub: 'user-1', session_id: 's1', user_metadata: { role: 'CLINICIAN', org_id: 'org-1' } }
    if (token === 'badrole') return { sub: 'user-2', session_id: 's2', user_metadata: { role: 'RECEPTIONIST', org_id: 'org-1' } }
    return null // any other token (incl. '') → unverified
  }),
}))
vi.mock('@/trpc/rbac', () => ({ hasResourceAccess: (role: string) => role === 'CLINICIAN' }))
vi.mock('@ultranos/audit-logger', () => ({ AuditLogger: class { emit = auditEmit } }))

import { POST } from '@/app/api/patient-photo/route'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

async function pngFile(): Promise<File> {
  const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer()
  return new File([buf], 'p.png', { type: 'image/png' })
}
function req(file: File, token = 'good', patientId = PID) {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('patientId', patientId)
  fd.set('lastKnownUpdate', '2999-01-01T00:00:00.000Z')
  return new Request('http://x/api/patient-photo', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: fd,
  })
}

describe('POST /api/patient-photo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    single.mockResolvedValue({ data: { id: PID, updated_at: '2000-01-01T00:00:00.000Z' }, error: null })
    updateSelect.mockResolvedValue({ data: [{ id: PID }], error: null })
    storageUpload.mockResolvedValue({ error: null })
  })

  it('401 without a bearer token', async () => {
    const res = await POST(req(await pngFile(), '') as never)
    expect(res.status).toBe(401)
  })

  it('403 when the verified role lacks Patient access', async () => {
    const res = await POST(req(await pngFile(), 'badrole') as never)
    expect(res.status).toBe(403)
  })

  it('re-encodes to WebP ≤512px, uploads, sets photo_url, audits', async () => {
    const res = await POST(req(await pngFile()) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photoUrl).toBe(`${PID}.webp`)

    // The uploaded buffer is a valid WebP, ≤512px, metadata stripped
    const uploadedBuf: Buffer = storageUpload.mock.calls[0][1]
    const meta = await sharp(uploadedBuf).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(512)
    expect(storageUpload.mock.calls[0][0]).toBe(`${PID}.webp`)
    expect(auditEmit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: PID,
    }))
  })

  it('409 on stale lastKnownUpdate', async () => {
    single.mockResolvedValue({ data: { id: PID, updated_at: '2999-12-31T00:00:00.000Z' }, error: null })
    const res = await POST(req(await pngFile()) as never)
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F hub-api exec vitest run src/__tests__/patient-photo-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/patient-photo/route`.

- [ ] **Step 4: Implement the route**

```ts
// apps/hub-api/src/app/api/patient-photo/route.ts
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getSupabaseClient, db } from '@/lib/supabase'
import { verifySupabaseJwt, getSupabaseJwk } from '@/lib/jwt'
import { hasResourceAccess } from '@/trpc/rbac'
import { AuditLogger } from '@ultranos/audit-logger'

const BUCKET = 'patient-photos'
const MAX_DIM = 512
const WEBP_QUALITY = 80
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuthedUser { sub: string; role: string; sessionId: string; orgId?: string }

async function authenticate(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwk = getSupabaseJwk()
  if (!jwk) return null
  const payload = await verifySupabaseJwt(authHeader.slice(7), jwk)
  if (!payload?.sub) return null
  const meta = (payload.user_metadata as Record<string, unknown>) ?? {}
  return {
    sub: payload.sub,
    role: ((meta.role as string) ?? (payload.role as string) ?? '').toUpperCase(),
    sessionId: (payload.session_id as string) ?? '',
    orgId: (meta.org_id as string) ?? (payload.org_id as string) ?? undefined,
  }
}

/** Fetch patient + guard optimistic concurrency. Returns key or an error response. */
async function loadAndGuard(
  supabase: ReturnType<typeof getSupabaseClient>,
  patientId: string,
  lastKnownUpdate: string,
): Promise<{ error: NextResponse } | { ok: true }> {
  const { data: current, error } = await supabase
    .from('patients')
    .select('id, updated_at')
    .eq('id', patientId)
    .eq('is_active', true)
    .single()
  if (error || !current) return { error: NextResponse.json({ error: 'Patient not found' }, { status: 404 }) }
  if (current.updated_at && lastKnownUpdate < current.updated_at) {
    return { error: NextResponse.json({ error: 'Stale update' }, { status: 409 }) }
  }
  return { ok: true }
}

async function setPhotoUrl(
  supabase: ReturnType<typeof getSupabaseClient>,
  user: AuthedUser,
  patientId: string,
  photoUrl: string | null,
): Promise<{ error: NextResponse } | { lastUpdated: string }> {
  const updatedAt = new Date().toISOString()
  const row = db.toRow({ photoUrl, updatedAt, updatedBy: user.sub })
  const { data, error } = await supabase
    .from('patients').update(row).eq('id', patientId).eq('is_active', true).select('id')
  if (error) return { error: NextResponse.json({ error: 'Update failed' }, { status: 500 }) }
  if (!data || data.length === 0) return { error: NextResponse.json({ error: 'Patient not found' }, { status: 404 }) }

  const audit = new AuditLogger(supabase, user.orgId)
  try {
    await audit.emit({
      action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: patientId,
      actorId: user.sub, actorRole: user.role, outcome: 'SUCCESS', sessionId: user.sessionId,
      metadata: { operation: photoUrl ? 'photo_upload' : 'photo_remove' },
    })
  } catch {
    console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: patientId })
  }
  return { lastUpdated: updatedAt }
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasResourceAccess(user.role, 'Patient')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form' }, { status: 400 }) }
  const file = form.get('file')
  const patientId = String(form.get('patientId') ?? '')
  const lastKnownUpdate = String(form.get('lastKnownUpdate') ?? '')
  if (!(file instanceof Blob)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!UUID.test(patientId)) return NextResponse.json({ error: 'Invalid patientId' }, { status: 400 })
  if (!lastKnownUpdate) return NextResponse.json({ error: 'Missing lastKnownUpdate' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 400 })

  const supabase = getSupabaseClient()
  const guard = await loadAndGuard(supabase, patientId, lastKnownUpdate)
  if ('error' in guard) return guard.error

  // Sharp: auto-orient, cap 512, WebP q80, metadata stripped (default)
  let webp: Buffer
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  } catch {
    return NextResponse.json({ error: 'Unsupported or corrupt image' }, { status: 400 })
  }

  const key = `${patientId}.webp`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET).upload(key, webp, { upsert: true, contentType: 'image/webp' })
  if (uploadError) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  const result = await setPhotoUrl(supabase, user, patientId, key)
  if ('error' in result) return result.error
  return NextResponse.json({ photoUrl: key, lastUpdated: result.lastUpdated }, { status: 200 })
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const user = await authenticate(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasResourceAccess(user.role, 'Patient')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { patientId?: string; lastKnownUpdate?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const patientId = String(body.patientId ?? '')
  const lastKnownUpdate = String(body.lastKnownUpdate ?? '')
  if (!UUID.test(patientId)) return NextResponse.json({ error: 'Invalid patientId' }, { status: 400 })
  if (!lastKnownUpdate) return NextResponse.json({ error: 'Missing lastKnownUpdate' }, { status: 400 })

  const supabase = getSupabaseClient()
  const guard = await loadAndGuard(supabase, patientId, lastKnownUpdate)
  if ('error' in guard) return guard.error

  await supabase.storage.from(BUCKET).remove([`${patientId}.webp`, `${patientId}.jpg`]).catch(() => {})

  const result = await setPhotoUrl(supabase, user, patientId, null)
  if ('error' in result) return result.error
  return NextResponse.json({ photoUrl: null, lastUpdated: result.lastUpdated }, { status: 200 })
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm -F hub-api exec vitest run src/__tests__/patient-photo-route.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F hub-api exec tsc --noEmit 2>&1 | grep -E "patient-photo" || echo "CLEAN"`
Expected: `CLEAN`.

- [ ] **Step 7: Commit**

```bash
git add apps/hub-api/package.json apps/hub-api/src/app/api/patient-photo/route.ts \
        apps/hub-api/src/__tests__/patient-photo-route.test.ts
git commit -m "feat(hub-api): patient photo upload/remove route with Sharp WebP re-encode"
```

---

### Task 3: Client API lib `patient-photo-api.ts`

**Files:**
- Create: `apps/opd-lite/src/lib/patient-photo-api.ts`
- Test: `apps/opd-lite/src/__tests__/patient-photo-api.test.ts`

**Interfaces:**
- Produces:
  - `export async function uploadPatientPhoto(patientId: string, blob: Blob, lastKnownUpdate: string): Promise<{ photoUrl: string; lastUpdated: string }>`
  - `export async function removePatientPhoto(patientId: string, lastKnownUpdate: string): Promise<{ lastUpdated: string }>`
- Consumes: `getAuthHeaders`, `getHubApiUrl` from `@/lib/hub-auth`. Note the Hub base from `getHubApiUrl()` is `<origin>/api/trpc`; strip the `/trpc` suffix to reach `/api/patient-photo`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/opd-lite/src/__tests__/patient-photo-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/hub-auth', () => ({
  getHubApiUrl: () => 'http://hub.test/api/trpc',
  getAuthHeaders: async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer TESTTOKEN' }),
}))

import { uploadPatientPhoto, removePatientPhoto } from '@/lib/patient-photo-api'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

describe('patient-photo-api', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POSTs multipart to /api/patient-photo with a bearer token (no JSON content-type)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ photoUrl: `${PID}.webp`, lastUpdated: 'T' }),
    })
    global.fetch = fetchMock as never

    const out = await uploadPatientPhoto(PID, new Blob(['x'], { type: 'image/jpeg' }), 'LKU')
    expect(out.photoUrl).toBe(`${PID}.webp`)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://hub.test/api/patient-photo')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer TESTTOKEN')
    // multipart: never set Content-Type manually (browser sets the boundary)
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('throws on non-OK upload', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409 }) as never
    await expect(uploadPatientPhoto(PID, new Blob(['x']), 'LKU')).rejects.toThrow(/409/)
  })

  it('DELETEs JSON with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ lastUpdated: 'T' }) })
    global.fetch = fetchMock as never
    await removePatientPhoto(PID, 'LKU')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://hub.test/api/patient-photo')
    expect(init.method).toBe('DELETE')
    expect(init.headers.Authorization).toBe('Bearer TESTTOKEN')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-photo-api.test.ts`
Expected: FAIL — cannot resolve `@/lib/patient-photo-api`.

- [ ] **Step 3: Implement**

```ts
// apps/opd-lite/src/lib/patient-photo-api.ts
import { getAuthHeaders, getHubApiUrl } from '@/lib/hub-auth'

/** Hub origin base (drops the trailing /api/trpc so we can hit /api/patient-photo). */
function photoEndpoint(): string {
  return getHubApiUrl().replace(/\/api\/trpc\/?$/, '') + '/api/patient-photo'
}

/** Auth headers WITHOUT Content-Type — the browser sets the multipart boundary itself. */
async function bearerOnly(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders()
  const { ['Content-Type']: _omit, ...rest } = headers
  return rest
}

export async function uploadPatientPhoto(
  patientId: string,
  blob: Blob,
  lastKnownUpdate: string,
): Promise<{ photoUrl: string; lastUpdated: string }> {
  const form = new FormData()
  form.set('file', blob, `${patientId}.img`)
  form.set('patientId', patientId)
  form.set('lastKnownUpdate', lastKnownUpdate)

  const res = await fetch(photoEndpoint(), { method: 'POST', headers: await bearerOnly(), body: form })
  if (!res.ok) throw new Error(`Photo upload failed: HTTP ${res.status}`)
  return res.json() as Promise<{ photoUrl: string; lastUpdated: string }>
}

export async function removePatientPhoto(
  patientId: string,
  lastKnownUpdate: string,
): Promise<{ lastUpdated: string }> {
  const res = await fetch(photoEndpoint(), {
    method: 'DELETE',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ patientId, lastKnownUpdate }),
  })
  if (!res.ok) throw new Error(`Photo remove failed: HTTP ${res.status}`)
  return res.json() as Promise<{ lastUpdated: string }>
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-photo-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/patient-photo-api.ts apps/opd-lite/src/__tests__/patient-photo-api.test.ts
git commit -m "feat(opd-lite): patient-photo Hub client (multipart upload + delete)"
```

---

### Task 4: `useWebcamCapture` hook

**Files:**
- Create: `apps/opd-lite/src/hooks/useWebcamCapture.ts`
- Test: `apps/opd-lite/src/__tests__/use-webcam-capture.test.ts`

**Interfaces:**
- Produces:
  - `export interface WebcamState { stream: MediaStream | null; status: 'idle' | 'starting' | 'live' | 'unavailable'; error: string | null }`
  - `export function useWebcamCapture(): { state: WebcamState; start: () => Promise<void>; stop: () => void; capture: (video: HTMLVideoElement) => string | null }`
- `capture(video)` draws the current frame to a canvas and returns a `image/png` data-URL (or `null` if the video has no dimensions). `start()` sets `status: 'unavailable'` when `getUserMedia` is missing or rejects (caller then falls back to the file input).

- [ ] **Step 1: Write the failing test**

```ts
// apps/opd-lite/src/__tests__/use-webcam-capture.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebcamCapture } from '@/hooks/useWebcamCapture'

describe('useWebcamCapture', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('marks status unavailable when getUserMedia rejects (fallback signal)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const { result } = renderHook(() => useWebcamCapture())
    await act(async () => { await result.current.start() })
    expect(result.current.state.status).toBe('unavailable')
  })

  it('marks status unavailable when mediaDevices is missing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const { result } = renderHook(() => useWebcamCapture())
    await act(async () => { await result.current.start() })
    expect(result.current.state.status).toBe('unavailable')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/use-webcam-capture.test.ts`
Expected: FAIL — cannot resolve `@/hooks/useWebcamCapture`.

- [ ] **Step 3: Implement**

```ts
// apps/opd-lite/src/hooks/useWebcamCapture.ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface WebcamState {
  stream: MediaStream | null
  status: 'idle' | 'starting' | 'live' | 'unavailable'
  error: string | null
}

export function useWebcamCapture() {
  const [state, setState] = useState<WebcamState>({ stream: null, status: 'idle', error: null })
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setState({ stream: null, status: 'idle', error: null })
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ stream: null, status: 'unavailable', error: null })
      return
    }
    setState((s) => ({ ...s, status: 'starting', error: null }))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setState({ stream, status: 'live', error: null })
    } catch {
      setState({ stream: null, status: 'unavailable', error: null })
    }
  }, [])

  const capture = useCallback((video: HTMLVideoElement): string | null => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  }, [])

  // Stop the camera on unmount so the device light turns off.
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])

  return { state, start, stop, capture }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/use-webcam-capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/hooks/useWebcamCapture.ts apps/opd-lite/src/__tests__/use-webcam-capture.test.ts
git commit -m "feat(opd-lite): useWebcamCapture hook with getUserMedia fallback"
```

---

### Task 5: `PatientPhotoUploadModal` + i18n

**Files:**
- Create: `apps/opd-lite/src/components/patient/PatientPhotoUploadModal.tsx`
- Modify: `apps/opd-lite/messages/en.json`, `ar.json`, `prs.json`, `ps.json` (add `patientPhoto` namespace)
- Test: `apps/opd-lite/src/__tests__/patient-photo-upload-modal.test.tsx`

**Interfaces:**
- Produces: `export function PatientPhotoUploadModal(props: { open: boolean; patientId: string; currentPhotoKey: string | null; lastKnownUpdate: string; onClose: () => void; onUpdated: (photoKey: string | null, lastUpdated: string) => void }): JSX.Element | null`
- Consumes: `PhotoCropper`/`PhotoCropperHandle` (Task 1), `uploadPatientPhoto`/`removePatientPhoto` (Task 3), `useWebcamCapture` (Task 4), `Dialog*` from ui-kit, `Alert` from `@ultranos/ui-kit`, `Button` from `@/components/ui/Button`.

- [ ] **Step 1: Add i18n keys**

Add this block as the first entry inside the top-level object of **each** of `en.json`, `ar.json`, `prs.json`, `ps.json` (English shown; translate values for the others — mirror the tone of existing `patient` keys):

```json
  "patientPhoto": {
    "title": "Update patient photo",
    "current": "Current photo",
    "uploadFile": "Upload file",
    "takePhoto": "Take photo",
    "remove": "Remove photo",
    "capture": "Capture",
    "retake": "Retake",
    "back": "Back",
    "usePhoto": "Use photo",
    "cameraStarting": "Starting camera…",
    "cameraUnavailable": "Camera unavailable — choose a file instead.",
    "saving": "Saving photo…",
    "offline": "Photo changes need an internet connection.",
    "tooLarge": "That image is too large (max 20 MB).",
    "saveFailed": "Couldn't save the photo. Please try again.",
    "conflict": "This patient was updated elsewhere. Close and reopen, then retry.",
    "retry": "Retry",
    "cancel": "Cancel"
  },
```

For `ar.json` use Arabic, `prs.json` Dari, `ps.json` Pashto. Example Arabic values: `"title": "تحديث صورة المريض"`, `"uploadFile": "رفع ملف"`, `"takePhoto": "التقاط صورة"`, `"remove": "إزالة الصورة"`, `"saving": "جارٍ حفظ الصورة…"`, `"offline": "تتطلب تغييرات الصورة اتصالاً بالإنترنت."`, `"saveFailed": "تعذّر حفظ الصورة. حاول مرة أخرى."`, `"cancel": "إلغاء"` (translate the rest consistently).

- [ ] **Step 2: Write the failing test**

```tsx
// apps/opd-lite/src/__tests__/patient-photo-upload-modal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('@ultranos/ui-kit/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))
vi.mock('@ultranos/ui-kit', () => ({ Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div> }))
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...p }: React.ComponentProps<'button'>) => <button {...p}>{children}</button>,
}))
// Cropper stub: a button that emits a cropped data URL.
vi.mock('@/components/patient/PhotoCropper', () => ({
  PhotoCropper: (_p: unknown) => <div>cropper</div>,
  __esModule: true,
}))
const uploadPatientPhoto = vi.fn()
const removePatientPhoto = vi.fn()
vi.mock('@/lib/patient-photo-api', () => ({
  uploadPatientPhoto: (...a: unknown[]) => uploadPatientPhoto(...a),
  removePatientPhoto: (...a: unknown[]) => removePatientPhoto(...a),
}))
vi.mock('@/hooks/useWebcamCapture', () => ({
  useWebcamCapture: () => ({ state: { stream: null, status: 'idle', error: null }, start: vi.fn(), stop: vi.fn(), capture: () => null }),
}))

import { PatientPhotoUploadModal } from '@/components/patient/PatientPhotoUploadModal'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'
function setup(overrides: Partial<React.ComponentProps<typeof PatientPhotoUploadModal>> = {}) {
  const onUpdated = vi.fn()
  const onClose = vi.fn()
  render(
    <PatientPhotoUploadModal
      open patientId={PID} currentPhotoKey={null} lastKnownUpdate="LKU"
      onClose={onClose} onUpdated={onUpdated} {...overrides}
    />,
  )
  return { onUpdated, onClose }
}

describe('PatientPhotoUploadModal', () => {
  beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }) })

  it('shows the source step with upload/take-photo actions', () => {
    setup()
    expect(screen.getByText('uploadFile')).toBeDefined()
    expect(screen.getByText('takePhoto')).toBeDefined()
  })

  it('disables actions and warns when offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    setup()
    expect(screen.getByText('offline')).toBeDefined()
    expect((screen.getByText('uploadFile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('removes the photo via the API and reports the update', async () => {
    removePatientPhoto.mockResolvedValue({ lastUpdated: 'T2' })
    const { onUpdated } = setup({ currentPhotoKey: `${PID}.webp` })
    fireEvent.click(screen.getByText('remove'))
    // confirm inline
    fireEvent.click(screen.getByText('remove'))
    await waitFor(() => expect(removePatientPhoto).toHaveBeenCalledWith(PID, 'LKU'))
    expect(onUpdated).toHaveBeenCalledWith(null, 'T2')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-photo-upload-modal.test.tsx`
Expected: FAIL — cannot resolve `@/components/patient/PatientPhotoUploadModal`.

- [ ] **Step 4: Implement the modal**

```tsx
// apps/opd-lite/src/components/patient/PatientPhotoUploadModal.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Upload, Trash2, RotateCcw } from '@ultranos/ui-kit/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ultranos/ui-kit/components/ui/dialog'
import { Alert } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/Button'
import { PhotoCropper, type PhotoCropperHandle } from '@/components/patient/PhotoCropper'
import { useWebcamCapture } from '@/hooks/useWebcamCapture'
import { uploadPatientPhoto, removePatientPhoto } from '@/lib/patient-photo-api'

const RAW_SIZE_LIMIT = 20 * 1024 * 1024

type Step = 'source' | 'camera' | 'crop' | 'uploading' | 'error'

interface Props {
  open: boolean
  patientId: string
  currentPhotoKey: string | null
  lastKnownUpdate: string
  onClose: () => void
  onUpdated: (photoKey: string | null, lastUpdated: string) => void
}

/** cropped data URL → Blob for multipart upload. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function PatientPhotoUploadModal({
  open, patientId, currentPhotoKey, lastKnownUpdate, onClose, onUpdated,
}: Props) {
  const t = useTranslations('patientPhoto')
  const [step, setStep] = useState<Step>('source')
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [online, setOnline] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cropperRef = useRef<PhotoCropperHandle>(null)
  const webcam = useWebcamCapture()

  // Reset to a clean state whenever the modal (re)opens.
  useEffect(() => {
    if (open) {
      setStep('source'); setRawDataUrl(null); setErrorMsg(''); setConfirmRemove(false)
      setOnline(navigator.onLine)
    }
  }, [open])

  // Track connectivity while open.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  // Attach the live stream to the <video> when the camera goes live; fall back to file on failure.
  useEffect(() => {
    if (step !== 'camera') return
    if (webcam.state.status === 'live' && videoRef.current) {
      videoRef.current.srcObject = webcam.state.stream
      void videoRef.current.play().catch(() => {})
    }
    if (webcam.state.status === 'unavailable') {
      setStep('source')
      fileInputRef.current?.click()
    }
  }, [step, webcam.state.status, webcam.state.stream])

  const close = useCallback(() => { webcam.stop(); onClose() }, [webcam, onClose])

  const onFilePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > RAW_SIZE_LIMIT) { setErrorMsg(t('tooLarge')); setStep('error'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result
      if (typeof result === 'string') { setRawDataUrl(result); setStep('crop') }
    }
    reader.readAsDataURL(file)
  }, [t])

  const startCamera = useCallback(() => { setStep('camera'); void webcam.start() }, [webcam])

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current) return
    const shot = webcam.capture(videoRef.current)
    webcam.stop()
    if (shot) { setRawDataUrl(shot); setStep('crop') }
    else { setStep('source') }
  }, [webcam])

  const doUpload = useCallback(async (croppedDataUrl: string) => {
    setStep('uploading')
    try {
      const blob = dataUrlToBlob(croppedDataUrl)
      const { photoUrl, lastUpdated } = await uploadPatientPhoto(patientId, blob, lastKnownUpdate)
      onUpdated(photoUrl, lastUpdated)
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error && /409/.test(err.message) ? t('conflict') : t('saveFailed'))
      setStep('error')
    }
  }, [patientId, lastKnownUpdate, onUpdated, close, t])

  const doRemove = useCallback(async () => {
    setStep('uploading')
    try {
      const { lastUpdated } = await removePatientPhoto(patientId, lastKnownUpdate)
      onUpdated(null, lastUpdated)
      close()
    } catch (err) {
      setErrorMsg(err instanceof Error && /409/.test(err.message) ? t('conflict') : t('saveFailed'))
      setStep('error')
    }
  }, [patientId, lastKnownUpdate, onUpdated, close, t])

  if (!open) return null
  const actionsDisabled = !online

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-sm w-full gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        {!online && <div className="px-5 pb-3"><Alert variant="warning">{t('offline')}</Alert></div>}

        {step === 'source' && (
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full bg-muted flex items-center justify-center">
              {/* Current photo preview is rendered by PatientAvatar upstream; here show a neutral placeholder. */}
              <Camera className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" type="button" disabled={actionsDisabled}
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t('uploadFile')}
              </Button>
              <Button variant="outline" type="button" disabled={actionsDisabled} onClick={startCamera}>
                <Camera className="h-4 w-4" /> {t('takePhoto')}
              </Button>
              {currentPhotoKey && (
                <Button variant="danger" type="button" disabled={actionsDisabled}
                  onClick={() => (confirmRemove ? void doRemove() : setConfirmRemove(true))}>
                  <Trash2 className="h-4 w-4" /> {confirmRemove ? t('remove') : t('remove')}
                </Button>
              )}
            </div>
            {confirmRemove && <p className="text-center text-xs text-muted-foreground">{t('remove')}</p>}
          </div>
        )}

        {step === 'camera' && (
          <div className="flex flex-col items-center gap-3 px-5 pb-5">
            {webcam.state.status === 'starting' && <p className="text-sm text-muted-foreground">{t('cameraStarting')}</p>}
            <video ref={videoRef} className="w-full rounded-xl bg-neutral-900" playsInline muted />
            <div className="flex justify-end gap-2 self-stretch">
              <Button variant="outline" type="button" onClick={() => { webcam.stop(); setStep('source') }}>{t('back')}</Button>
              <Button variant="primary" type="button" onClick={captureFromCamera}>{t('capture')}</Button>
            </div>
          </div>
        )}

        {step === 'crop' && (
          <>
            <div className="flex justify-center px-5">
              <PhotoCropper ref={cropperRef} rawDataUrl={rawDataUrl} onCropped={doUpload} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="outline" type="button" onClick={() => setStep('source')}>{t('back')}</Button>
              <Button variant="primary" type="button" onClick={() => cropperRef.current?.crop()}>{t('usePhoto')}</Button>
            </div>
          </>
        )}

        {step === 'uploading' && (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
            <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('saving')}
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col gap-4 px-5 py-5">
            <Alert variant="destructive">{errorMsg}</Alert>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={close}>{t('cancel')}</Button>
              <Button variant="primary" type="button" onClick={() => setStep('source')}>{t('retry')}</Button>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={onFilePicked} aria-hidden="true" tabIndex={-1} />
      </DialogContent>
    </Dialog>
  )
}
```

> The remove flow uses a two-click inline confirm (`confirmRemove`): first click arms, second click calls `doRemove`. The test clicks `remove` twice. Keep the button label keyed to `t('remove')` in both states (a distinct "confirm" label can be added later; YAGNI now).

- [ ] **Step 5: Run tests**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-photo-upload-modal.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Typecheck + i18n parity**

Run: `pnpm -F opd-lite exec tsc --noEmit 2>&1 | grep -E "PatientPhotoUploadModal" || echo "CLEAN"`
Expected: `CLEAN`.

Run: `node -e "for (const l of ['en','ar','prs','ps']) { const m=require('./apps/opd-lite/messages/'+l+'.json'); if(!m.patientPhoto?.saveFailed) throw new Error('missing patientPhoto in '+l); } console.log('i18n OK')"`
Expected: `i18n OK`.

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientPhotoUploadModal.tsx \
        apps/opd-lite/src/__tests__/patient-photo-upload-modal.test.tsx \
        apps/opd-lite/messages/en.json apps/opd-lite/messages/ar.json \
        apps/opd-lite/messages/prs.json apps/opd-lite/messages/ps.json
git commit -m "feat(opd-lite): PatientPhotoUploadModal (source/camera/crop/upload/remove)"
```

---

### Task 6: Wire `PatientAvatar` to the modal; simplify `PatientHeaderCard.handlePhotoUpdated`

**Files:**
- Modify: `apps/opd-lite/src/components/patient/PatientAvatar.tsx`
- Modify: `apps/opd-lite/src/components/patient/PatientHeaderCard.tsx`
- Modify: `apps/opd-lite/src/__tests__/patient-header-photo-auth.test.tsx` (update to the new no-`patient.update` behavior)
- Test: `apps/opd-lite/src/__tests__/patient-avatar-modal.test.tsx`

**Interfaces:**
- `PatientAvatar` keeps `{ patient, patientId, size?, onPhotoUpdated?: (photoKey: string | null) => void }` but now: clicking the avatar/camera overlay opens `PatientPhotoUploadModal`; the signed-URL read uses the stored `patient._ultranos.photoUrl` **key** (falling back to `${patientId}.jpg` for legacy rows whose `photoUrl` is unset but a `.jpg` exists is **not** attempted — only fetch when `photoUrl` is set). On modal success it calls `onPhotoUpdated(key)`.
- `PatientHeaderCard.handlePhotoUpdated(photoKey: string | null)` no longer calls `patient.update`; it updates Dexie + parent state only (the Hub already persisted + audited).

- [ ] **Step 1: Write the failing test (avatar opens modal, reads stored key)**

```tsx
// apps/opd-lite/src/__tests__/patient-avatar-modal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FhirPatient } from '@ultranos/shared-types'

const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null })
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}))
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(), AuditAction: { UPDATE: 'UPDATE' }, AuditResourceType: { PATIENT: 'Patient' },
}))
// Modal stub: render a marker + a button that fires onUpdated.
vi.mock('@/components/patient/PatientPhotoUploadModal', () => ({
  PatientPhotoUploadModal: ({ open, onUpdated }: { open: boolean; onUpdated: (k: string | null, u: string) => void }) =>
    open ? <button onClick={() => onUpdated('key.webp', 'T')}>modal-open</button> : null,
}))

import { PatientAvatar } from '@/components/patient/PatientAvatar'

const PID = '5d60f549-6fd0-4633-8746-2877d3f62abb'
const patient = {
  id: PID, resourceType: 'Patient', name: [{ given: ['A'], text: 'A' }],
  _ultranos: { nameGiven: 'A', nameFather: 'B', photoUrl: `${PID}.webp` }, meta: { lastUpdated: 'L' },
} as unknown as FhirPatient

describe('PatientAvatar → modal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the STORED photo key for the signed URL (not a hardcoded .jpg)', () => {
    render(<PatientAvatar patient={patient} patientId={PID} />)
    expect(createSignedUrl).toHaveBeenCalledWith(`${PID}.webp`, 3600)
  })

  it('opens the upload modal on click and forwards the new key', () => {
    const onPhotoUpdated = vi.fn()
    render(<PatientAvatar patient={patient} patientId={PID} onPhotoUpdated={onPhotoUpdated} />)
    fireEvent.click(screen.getByRole('button', { name: /upload patient photo/i }))
    fireEvent.click(screen.getByText('modal-open'))
    expect(onPhotoUpdated).toHaveBeenCalledWith('key.webp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-avatar-modal.test.tsx`
Expected: FAIL — current `PatientAvatar` hardcodes `${patientId}.jpg` and has no modal.

- [ ] **Step 3: Rewrite `PatientAvatar` to open the modal + read the stored key**

Replace the file's upload machinery. Key changes: (a) drop `resizeImage`, `handleFileChange`, the hidden file input, and the direct Storage upload; (b) add modal open state; (c) signed-URL effect reads `patient._ultranos.photoUrl` as the key; (d) `onPhotoUpdated` now forwards `photoKey: string | null`. Full new file:

```tsx
// apps/opd-lite/src/components/patient/PatientAvatar.tsx
'use client'

import { useEffect, useState } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'
import { Camera } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { PatientPhotoUploadModal } from '@/components/patient/PatientPhotoUploadModal'

interface PatientAvatarProps {
  patient: FhirPatient
  patientId: string
  size?: number
  onPhotoUpdated?: (photoKey: string | null) => void
}

function idToColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 45%, 55%)`
}
function getInitials(patient: FhirPatient): string {
  const g = patient._ultranos.nameGiven?.charAt(0) ?? ''
  const f = patient._ultranos.nameFather?.charAt(0) ?? ''
  return (g + f) || '?'
}

export function PatientAvatar({ patient, patientId, size = 80, onPhotoUpdated }: PatientAvatarProps) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const photoKey = patient._ultranos.photoUrl ?? null

  useEffect(() => {
    if (!photoKey) { setPhotoSrc(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().storage
          .from('patient-photos').createSignedUrl(photoKey, 3600)
        if (!cancelled && data?.signedUrl && !error) setPhotoSrc(data.signedUrl)
      } catch { /* show initials fallback */ }
    })()
    return () => { cancelled = true }
  }, [photoKey])

  const initials = getInitials(patient)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="group relative cursor-pointer overflow-hidden rounded-full"
        style={{ width: size, height: size }}
        onClick={() => setModalOpen(true)}
        role="button" tabIndex={0} aria-label="Upload patient photo"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalOpen(true) } }}
      >
        {photoSrc ? (
          <img src={photoSrc} alt="" className="h-full w-full object-cover" aria-hidden="true" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white font-bold select-none"
            style={{ backgroundColor: idToColor(patientId), fontSize: size * 0.35 }} aria-hidden="true">
            {initials}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
      </div>

      <PatientPhotoUploadModal
        open={modalOpen}
        patientId={patientId}
        currentPhotoKey={photoKey}
        lastKnownUpdate={patient.meta.lastUpdated}
        onClose={() => setModalOpen(false)}
        onUpdated={(key) => { setModalOpen(false); onPhotoUpdated?.(key) }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Simplify `PatientHeaderCard.handlePhotoUpdated`**

In `apps/opd-lite/src/components/patient/PatientHeaderCard.tsx`, replace the entire `handlePhotoUpdated` callback body (the version that does `getAuthHeaders()` + `fetch('/patient.update')` + audit) with a local-only update. The Hub route already persisted `photo_url` and audited, so the client just mirrors it into Dexie. Also change the signature to accept a nullable key.

```tsx
  // Handle photo update: the Hub route already persisted + audited; mirror locally.
  const handlePhotoUpdated = useCallback(
    async (photoKey: string | null) => {
      const updatedPatient: FhirPatient = {
        ...patient,
        _ultranos: { ...patient._ultranos, photoUrl: photoKey ?? undefined },
        meta: { ...patient.meta, lastUpdated: new Date().toISOString() },
      }
      try {
        await db.patients.put(updatedPatient)
      } catch {
        // Local mirror failed — non-fatal; server is source of truth and will re-sync.
      }
      onPatientUpdated(updatedPatient)
    },
    [patient, onPatientUpdated],
  )
```

Then remove the now-unused imports/usages in `PatientHeaderCard.tsx`: `getAuthHeaders` (from `@/lib/hub-auth`), `auditPhiAccess`/`AuditAction`/`AuditResourceType` (from `@/lib/audit`), the `HUB_API_URL`/`getHubTrpcUrl` constant if no longer referenced, and the `photoError` state + the `photoNotSaved` notice JSX under the avatar (the modal now owns error UX).

Run to find leftover references:
Run: `pnpm -F opd-lite exec tsc --noEmit 2>&1 | grep -E "PatientHeaderCard" || echo "CLEAN"`
Expected: `CLEAN` (fix any "declared but never used" by deleting the dead import/const).

- [ ] **Step 5: Update the existing photo-auth test to the new behavior**

The old `apps/opd-lite/src/__tests__/patient-header-photo-auth.test.tsx` asserted `PatientHeaderCard` POSTs `patient.update` with a bearer token. That path is gone. Replace its two `it(...)` blocks with a single behavioral test that the header mirrors an update into Dexie without any Hub fetch:

```tsx
  it('mirrors a photo update into Dexie without calling patient.update', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch
    render(
      <PatientHeaderCard patient={patient} patientId={PATIENT_ID}
        onEditClick={() => {}} onPatientUpdated={() => {}} />,
    )
    fireEvent.click(screen.getByText('upload-photo')) // PatientAvatar mock fires onPhotoUpdated('key.webp')
    await waitFor(() => expect(putPatient).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalled()
  })
```

Update that file's `PatientAvatar` mock so its button calls `onPhotoUpdated('key.webp')` (nullable-key signature), and keep the `@/lib/db` mock exposing `patients.put` as `putPatient`. Remove the now-irrelevant Supabase-session and audit assertions.

- [ ] **Step 6: Run the affected tests**

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-avatar-modal.test.tsx src/__tests__/patient-header-photo-auth.test.tsx`
Expected: PASS.

- [ ] **Step 7: RTL snapshot (patient-facing requirement)**

Add an LTR + RTL render assertion for the modal's source step in `patient-photo-upload-modal.test.tsx` (append):

```tsx
  it('renders in RTL without crashing (dir=rtl)', () => {
    document.documentElement.dir = 'rtl'
    setup()
    expect(screen.getByText('uploadFile')).toBeDefined()
    document.documentElement.dir = 'ltr'
  })
```

Run: `pnpm -F opd-lite exec vitest run src/__tests__/patient-photo-upload-modal.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/opd-lite/src/components/patient/PatientAvatar.tsx \
        apps/opd-lite/src/components/patient/PatientHeaderCard.tsx \
        apps/opd-lite/src/__tests__/patient-avatar-modal.test.tsx \
        apps/opd-lite/src/__tests__/patient-header-photo-auth.test.tsx \
        apps/opd-lite/src/__tests__/patient-photo-upload-modal.test.tsx
git commit -m "feat(opd-lite): open photo upload modal from avatar; drop client patient.update for photos"
```

---

## Final Verification (after all tasks)

- [ ] Run the full opd-lite photo-related suite:
  `pnpm -F opd-lite exec vitest run src/__tests__/photo-cropper.test.tsx src/__tests__/patient-photo-api.test.tsx src/__tests__/use-webcam-capture.test.tsx src/__tests__/patient-photo-upload-modal.test.tsx src/__tests__/patient-avatar-modal.test.tsx src/__tests__/patient-header-photo-auth.test.tsx`
  Expected: all PASS.
- [ ] Run the hub-api route test: `pnpm -F hub-api exec vitest run src/__tests__/patient-photo-route.test.ts` — PASS.
- [ ] Typecheck both: `pnpm -F opd-lite exec tsc --noEmit` and `pnpm -F hub-api exec tsc --noEmit` — no NEW errors in touched files (pre-existing repo test-type errors are out of scope).
- [ ] Manual smoke (optional, requires running hub-api + opd-lite): open a chart → click avatar → upload a JPEG/PNG → confirm crop → verify a `<id>.webp` object appears in the `patient-photos` bucket, `patients.photo_url` = `<id>.webp`, an audit row exists, and the avatar shows the new photo. Repeat for webcam capture and Remove.

## Notes / Confirm During Execution

- **`patients.photo_url` column** is already read/written by the existing `patient.update` resolver (`apps/hub-api/src/trpc/routers/patient.ts:1270`), so no schema change is expected. If a migration is somehow needed, use the Supabase MCP tools (never raw SQL) per CLAUDE.md.
- **Sharp in CI/Docker:** `sharp` ships prebuilt binaries for common platforms; if the Hub's container base is Alpine/musl, confirm the build installs the correct `sharp` binary (may need `libvips`-compatible base or the `--os`/`--cpu` install flags). Flag during the Task 2 commit if CI fails.
- **RBAC verb:** the route uses `hasResourceAccess(role, 'Patient')` to match the `patient.update` gate. If `enforceResourceAccess` semantics differ (e.g., write vs read), align the check with how `patient.update` authorizes writes.
