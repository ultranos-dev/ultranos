# Sync Workflow Audit — All PWA Spokes (2026-07-24)

Audit of the offline sync workflows across every Next.js PWA (`opd-lite`, `pharmacy-lite`,
`lab-lite`, `admin-portal`) and the shared `@ultranos/sync-engine`, triggered by the fixes
made to opd-lite's photo/sync workflow. Every finding below was verified against the actual
source (endpoint existence checked against `apps/hub-api/src/trpc/routers/*` and
`apps/hub-api/src/app/api/**`; wiring checked by grepping for callers).

## Scope & method

- **Reviewed:** each app's `SyncProvider`, sync store, push/drain path, any pull/apply,
  conflict handling, auth-token source, error surfacing, CSP, and Hub REST/CORS usage; plus
  the shared engine (`drain-worker`, `hlc`, `conflict-resolver`, `queue`, `enqueue`).
- **Verified, not assumed:** Hub procedure/route existence grepped in `hub-api`; module wiring
  grepped for callers; HLC crash paths traced through try/catch; auth stores read directly.
- `admin-portal` has **no offline sync** (does not use `@ultranos/sync-engine`) — online-only.

## Revisions applied (this pass — in the working tree / committed alongside this doc)

| App | Change | Why |
|---|---|---|
| opd-lite | `applyPulledEncounter` HLC default `\|\| '0'` → `\|\| ZERO_HLC` (`sync-pull.ts`) | `deserializeHlc('0')` throws; an encounter with an empty `hlcTimestamp` failed to apply. Same class as the earlier `pullPatientChanges` fix. |
| pharmacy-lite | CSP `supabaseOrigin` added (`next.config.js`) | Supabase client (auth/storage) was omitted from `connect-src`/`img-src` — blocked once CSP is enforced. |
| pharmacy-lite | Manual retry no longer `JSON.parse`s the stored payload (`SyncQueueDashboard.tsx`) | Stored payloads are `enc:v1:` ciphertext; `JSON.parse` threw and force-failed the entry. Now hands it back to the decrypting DrainWorker. |
| lab-lite | CSP `supabaseOrigin` added + dev `hubApiOrigin` default `:3000` → `:3004` (`next.config.js`) | Same Supabase CSP gap; and the wrong port pinned CSP `connect-src` off the real Hub in dev. |

Prior related fixes (already committed in `0372eae`): opd-lite `ZERO_HLC` guard in
`pullPatientChanges`, Patient Tier-3 LWW path (no spurious Demographics conflicts / no
watermark poisoning), sync-error de-masking, and the ui-kit `getSecurityHeaders`
`supabaseOrigin` support.

## Verified clean — no change needed

- **Shared `@ultranos/sync-engine`:** the only unguarded `deserializeHlc` (`drain-worker.ts:153`)
  is inside a `try/catch` (`:171`) that marks the entry failed — **no crash**. `enqueueSyncAction`
  takes a caller-stamped `serializeHlc(hlc.now())` (valid HLC). Robust.
- **pharmacy & lab auth:** bearer tokens come from the real Supabase session
  (`getAccessToken()` → `getSession().access_token`, and `getSession().access_token` respectively),
  not a nonexistent store field.
- **pharmacy & lab error surfacing:** both push the real failure reason to `setSyncError`
  (KYC/subscription/HTTP status), no generic "couldn't reach the Hub" masking.
- **lab-lite live push path:** `lab.uploadResult` (exists) + `audit.sync` (exists), CORS-covered
  by the tRPC route, real token, backoff, honest failure state. Correct.
- **HLC conflict resolution** is not run client-side in pharmacy/lab (push-only; no `DrainWorker`
  conflict branch reached) — the ISO-vs-HLC / spurious-conflict problem is opd-lite-specific and
  already fixed there.

## Open findings — triage required (NOT auto-fixed: incomplete features / need Hub work)

> These are verified real but are **unfinished or deferred features**, not sync-robustness bugs.
> "Fixing" them means implementing Hub-side procedures and/or wiring drains on contracts that do
> not yet exist — a product/architecture decision, deliberately left for confirmation.

### lab-lite — sync modules calling non-existent Hub endpoints, and unwired
Verified missing from `apps/hub-api/src/trpc/routers/lab.ts` and `_app.ts`:
`lab.authorizeResult`, `lab.createNotification`, `lab.escalateAiResult`, `lab.syncQualityProfile`,
`lab.listLearningModules`, `lab.syncModuleCompletions`, `lab.listSOPs`,
`lab.syncSOPAcknowledgments`, and the `mentorship.*` / `peerNetwork.*` routers. Verified unwired
(no callers; ~1 ref each = the definition only):
- `authorization-sync.ts` (`lab.authorizeResult` `:42`, `lab.createNotification` `:112`)
- `confidence-escalation.ts` (`lab.escalateAiResult` `:77`)
- `quality-sync.ts` — also **imports a non-existent `getTrpcClient`** from `@/lib/trpc` (`:15`)
- `module-sync.ts`, `sop-sync.ts`, `peer-network-sync.ts`
- `mentorship-sync.ts` — additionally sends **no `Authorization` header** (`:167,235,280,330`)
- `consultation-sync.ts` / `consultation-recipients.ts` — POST to `${hubApiUrl}/consultation/*`
  (no `consultation` router/route exists; base is the tRPC base so the path is malformed)
- `certification-sync.ts` — relative `/api/certification/*` paths (resolve to lab-lite's own
  origin, no such route) and a **PUT** (`:63`) that CORS would reject (`corsHeaders` allows
  `GET, POST, DELETE` only)

**Recommended action:** confirm intended scope per module. For each that should ship: add the
Hub tRPC procedure (or REST route + CORS/OPTIONS), point the client at `${getHubApiUrl()}/<proc>`
with a bearer token, add an `Array.isArray` guard on list responses, and wire the drain into
`SyncProvider`. For those that are future work: leave dead-code as-is or remove.

### pharmacy-lite
- **409 conflict resolution not wired** (`drain-sync-fn.ts:55`) — a 409 returns a generic error
  and retries to `maxRetries` then sits `failed`; no `onConflict`/remote-version path. Documented
  deferral to Story 26.4. **Action:** when 26.4 lands, return the remote version so the
  DrainWorker's conflict path runs (MedicationDispense carries a real HLC, so it's safe there).
- **`prescription-verify.ts:221` → `/api/practitioners/by-public-key/…`** does not exist on the
  Hub and is composed onto a base that already ends in `/api/trpc` (doubled path). This is the QR
  prescription-verify path (adjacent to sync), fail-closed. **Action:** point at the real
  `practitionerKey.*` tRPC procedure or add the REST route.

### Cross-cutting / infra
- **Non-tRPC Hub REST routes lack CORS** except `patient-photo` (now) — `lab-files/[fileId]`,
  `metrics`, etc. Only a problem if fetched via `fetch`/XHR cross-origin from a browser (a
  `lab-files` `<a download>` navigation would not preflight). **Action:** verify call style; add
  CORS to any REST route hit cross-origin by a browser.
- **pharmacy `SyncQueueDashboard.test.tsx` (22 tests)** fail on a missing `NextIntlClientProvider`
  — pre-existing test-harness gap, not sync logic. **Action:** wrap the render in the intl
  provider (or mock `next-intl`) so the dashboard/retry behavior is actually covered.

## Could not verify (flagged, not claimed)
- Whether the missing Hub procedures exist on a **different branch / separate deployment** — all
  "missing → 404" claims are scoped to this working tree.
- The deployed `NEXT_PUBLIC_HUB_API_URL` value (determines whether the dev port/CSP-origin issues
  manifest in production, where the env var overrides the defaults).
