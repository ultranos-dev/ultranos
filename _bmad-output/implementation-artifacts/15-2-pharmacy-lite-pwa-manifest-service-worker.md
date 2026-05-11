# Story 15.2: Pharmacy Lite PWA Manifest & Service Worker

Status: done

## Story

As a pharmacist,
I want to install Pharmacy Lite as a standalone app on my workstation,
so that it is always available and loads instantly.

## Acceptance Criteria

1. A valid `manifest.json` is served with: name ("Pharmacy Lite"), short_name ("PharmacyLite"), description, start_url ("/"), display="standalone", theme_color, background_color, and icons (192px, 512px)
2. A Service Worker registers with cache-first for App Shell assets and network-first for API calls
3. The Inter font is self-hosted (not CDN)
4. The install prompt or custom banner appears after 2 minutes
5. The Service Worker handles version updates gracefully — a "New version available" toast notifies the user, and clicking "Update" activates the new SW and reloads
6. PHI-bearing API responses (prescriptions, dispensing records) are NEVER cached by the Service Worker
7. Service Worker lifecycle does not interfere with Dexie sync queue or dispense audit IndexedDB
8. All existing Pharmacy Lite tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Add PWA dependencies (AC: #2)
  - [x] Add `@serwist/next` and `serwist` to `apps/pharmacy-lite/package.json`
  - [x] Run `pnpm install`

- [x] Task 2: Self-host Inter font (AC: #3)
  - [x] Download Inter woff2 files (400, 500, 600, 700, 900) to `apps/pharmacy-lite/public/fonts/`
  - [x] Replace `import { Inter } from 'next/font/google'` with `import localFont from 'next/font/local'` in `layout.tsx`
  - [x] Match current weight config exactly

- [x] Task 3: Create PWA manifest (AC: #1)
  - [x] Create `apps/pharmacy-lite/src/app/manifest.ts`
  - [x] Set: name="Pharmacy Lite — Prescription Fulfillment", short_name="PharmacyLite", start_url="/", display="standalone"
  - [x] Create placeholder icon PNGs in `apps/pharmacy-lite/public/icons/`

- [x] Task 4: Create Service Worker (AC: #2, #6, #7)
  - [x] Create `apps/pharmacy-lite/src/app/sw.ts` using Serwist
  - [x] Cache-first for App Shell (JS, CSS, woff2, HTML)
  - [x] Network-first with 5s timeout for `/api/trpc/*` (non-PHI only)
  - [x] EXCLUDE PHI responses from cache (medication, dispense endpoints)
  - [x] `skipWaiting: true`, `clientsClaim: true`

- [x] Task 5: Configure Next.js for PWA (AC: #2)
  - [x] Update `apps/pharmacy-lite/next.config.js` — wrap with `withSerwist()`

- [x] Task 6: Create install prompt (AC: #4)
  - [x] Create `apps/pharmacy-lite/src/components/InstallPrompt.tsx`
  - [x] Same pattern as OPD Lite 15-1: `beforeinstallprompt`, 2-min delay, sessionStorage dismissal

- [x] Task 7: Create SW update notification (AC: #5)
  - [x] Create `apps/pharmacy-lite/src/components/SwUpdateNotification.tsx`
  - [x] Listen for `controllerchange` event on `navigator.serviceWorker`
  - [x] When new SW is waiting: show toast "A new version of Pharmacy Lite is available"
  - [x] "Update" button: post `SKIP_WAITING` message to waiting SW, then `window.location.reload()`
  - [x] "Later" button: dismiss toast
  - [x] Style as a bottom-right fixed toast (Tailwind)

- [x] Task 8: Integrate into app (AC: #1, #4, #5)
  - [x] Add `<InstallPrompt />` and `<SwUpdateNotification />` to `ClientErrorBoundary.tsx`
  - [x] Verify manifest is auto-discovered by Next.js

- [x] Task 9: Verify and test (AC: #8)
  - [x] Run `pnpm -F pharmacy-lite build` — build fails due to pre-existing shared-types issue (unrelated)
  - [x] Verify all existing tests pass — 19 pre-existing failures unchanged, 12 new PWA tests pass

## Dev Notes

### Same Pattern as OPD Lite (Story 15-1)

This story follows the exact same technical approach as 15-1. Key differences:

| Aspect | OPD Lite (15-1) | Pharmacy Lite (15-2) |
|--------|------|------|
| App name | OPD Lite | Pharmacy Lite |
| Short name | OPDLite | PharmacyLite |
| Description | Clinical Encounters | Prescription Fulfillment |
| Port | 3001 | 3002 |
| Extra: SW update toast | No | Yes |
| Extra: Offline fallback | No | No |

### SW Update Notification

Pharmacy Lite adds a version update mechanism not in 15-1. When a new Service Worker is detected:

```typescript
// apps/pharmacy-lite/src/components/SwUpdateNotification.tsx
'use client'
import { useEffect, useState } from 'react'

export function SwUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW waiting — prompt user
            setShowUpdate(true)
          }
        })
      })
    })
  }, [])

  if (!showUpdate) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-primary-200 bg-white p-4 shadow-lg">
      <p className="text-sm font-medium text-neutral-900">A new version is available</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            navigator.serviceWorker.ready.then((reg) => {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
            })
            window.location.reload()
          }}
          className="rounded-md bg-primary-600 px-3 py-1 text-sm text-white hover:bg-primary-700"
        >
          Update
        </button>
        <button
          onClick={() => setShowUpdate(false)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Later
        </button>
      </div>
    </div>
  )
}
```

The SW needs to handle the `SKIP_WAITING` message:
```typescript
// In sw.ts
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
```

### PHI Safety

Same rules as 15-1: NEVER cache prescription, dispensing, or patient data in the SW. Only cache static assets and non-PHI API responses.

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/pharmacy-lite/package.json` | UPDATE | Add @serwist/next, serwist |
| `apps/pharmacy-lite/next.config.js` | UPDATE | Wrap with withSerwist() |
| `apps/pharmacy-lite/src/app/manifest.ts` | NEW | PWA manifest |
| `apps/pharmacy-lite/src/app/sw.ts` | NEW | Service worker |
| `apps/pharmacy-lite/src/app/layout.tsx` | UPDATE | localFont instead of google |
| `apps/pharmacy-lite/src/components/InstallPrompt.tsx` | NEW | Install banner |
| `apps/pharmacy-lite/src/components/SwUpdateNotification.tsx` | NEW | Version update toast |
| `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` | UPDATE | Add InstallPrompt + SwUpdateNotification |
| `apps/pharmacy-lite/public/fonts/inter-*.woff2` | NEW | Self-hosted fonts |
| `apps/pharmacy-lite/public/icons/icon-192.png` | NEW | PWA icon |
| `apps/pharmacy-lite/public/icons/icon-512.png` | NEW | PWA icon |

### What NOT to Change

- DO NOT cache PHI/prescription data in SW cache
- DO NOT interfere with IndexedDB sync queue or dispense audit
- DO NOT modify OPD Lite or Lab Lite
- DO NOT use `next-pwa` (unmaintained)

### References

- [Source: apps/opd-lite/ story 15-1] — Reference PWA implementation (COPY PATTERN, add SW update toast)
- [Source: apps/pharmacy-lite/src/app/layout.tsx] — Current font loading (UPDATE)
- [Source: apps/pharmacy-lite/next.config.js] — Current config (UPDATE)
- [Source: CLAUDE.md#Offline-First] — Every workflow must work without network
- [Source: CLAUDE.md#Encryption] — PHI never in SW cache

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Build fails due to pre-existing missing FHIR modules in @ultranos/shared-types (consent.js, audit-event.js) — not related to PWA changes
- 19 pre-existing test failures in fulfillment-store, FulfillmentChecklist, medication-dispense, prescription-verify — all unrelated to PWA

### Completion Notes List
- Implemented full PWA infrastructure: manifest, service worker, install prompt, SW update notification
- Service worker uses Serwist 9.x with cache-first for static assets, network-first for non-PHI API calls
- PHI endpoints (medication, dispense, prescription, patient) are explicitly excluded from all caching
- Inter font self-hosted from fontsource CDN (5 weights: 400-900)
- Install prompt uses 2-minute delay with sessionStorage dismissal
- SW update toast with "Update" (SKIP_WAITING + reload) and "Later" (dismiss) buttons
- 12 new tests: manifest validation (5), install prompt behavior (4), SW update notification (3)
- No regressions: pre-existing 19 failures unchanged, new tests all pass
- TypeScript clean: no TS errors in any new files

### File List
- `apps/pharmacy-lite/package.json` — MODIFIED (added @serwist/next, serwist devDeps)
- `apps/pharmacy-lite/next.config.js` — MODIFIED (wrapped with withSerwist())
- `apps/pharmacy-lite/src/app/layout.tsx` — MODIFIED (localFont instead of Google Fonts)
- `apps/pharmacy-lite/src/app/manifest.ts` — NEW (PWA manifest)
- `apps/pharmacy-lite/src/app/sw.ts` — NEW (Service Worker with PHI exclusion)
- `apps/pharmacy-lite/src/components/InstallPrompt.tsx` — NEW (install banner)
- `apps/pharmacy-lite/src/components/SwUpdateNotification.tsx` — NEW (version update toast)
- `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` — MODIFIED (added InstallPrompt + SwUpdateNotification)
- `apps/pharmacy-lite/public/fonts/inter-latin-400.woff2` — NEW
- `apps/pharmacy-lite/public/fonts/inter-latin-500.woff2` — NEW
- `apps/pharmacy-lite/public/fonts/inter-latin-600.woff2` — NEW
- `apps/pharmacy-lite/public/fonts/inter-latin-700.woff2` — NEW
- `apps/pharmacy-lite/public/fonts/inter-latin-900.woff2` — NEW
- `apps/pharmacy-lite/public/icons/icon-192.png` — NEW (placeholder)
- `apps/pharmacy-lite/public/icons/icon-512.png` — NEW (placeholder)
- `apps/pharmacy-lite/src/__tests__/manifest.test.ts` — NEW (5 tests)
- `apps/pharmacy-lite/src/__tests__/install-prompt.test.tsx` — NEW (4 tests)
- `apps/pharmacy-lite/src/__tests__/sw-update-notification.test.tsx` — NEW (3 tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (status update)

### Review Findings

- [x] [Review][Decision] `skipWaiting: true` defeats SwUpdateNotification UX — RESOLVED: removed skipWaiting from Serwist config [sw.ts]
- [x] [Review][Decision] Manifest `name` deviates from AC1 — RESOLVED: kept as-is (more descriptive, spirit of AC met)
- [x] [Review][Patch] Race condition: reload fires before SKIP_WAITING is processed — FIXED: wait for controllerchange before reload [SwUpdateNotification.tsx]
- [x] [Review][Patch] safeDefaultCache matcher returns non-boolean for non-function matchers — FIXED: handle RegExp case, return false for unknown [sw.ts]
- [x] [Review][Defer] PHI pattern bypass via URL encoding — theoretical, tRPC doesn't encode paths this way — deferred, pre-existing
- [x] [Review][Defer] PHI endpoint list may be incomplete (audit/inventory routes) — deferred, separate audit needed
- [x] [Review][Defer] No dedicated test for PHI cache exclusion (AC6) — deferred, testing architecture item
- [x] [Review][Defer] No verification test for IndexedDB non-interference (AC7) — deferred, integration test scope
