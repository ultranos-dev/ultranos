/**
 * @ultranos/hub-client — TYPE-ONLY shared Hub contract for the raw-fetch spokes
 * (opd-lite, lab-lite, pharmacy-lite).
 *
 * ── Why type-only (Story 59.2, AC3) ──────────────────────────────────────────
 * The three PWA spokes talk to the Hub over hand-built `fetch` calls whose exact
 * request bytes (method / path / headers / body) MUST stay byte-identical to the
 * pre-migration code (AC6, zero-regression). Their transport layers differ from
 * each other today (opd-lite routes through `hubTrpcRequest` with a Supabase
 * 401-refresh-retry; lab-lite passes a bare `Authorization` bearer with per-call
 * `AbortSignal.timeout`; pharmacy-lite pulls the token from a zustand store) — so
 * a single shared RUNTIME client cannot be dropped in without changing headers on
 * the wire. What CAN be shared safely, with zero runtime footprint, is the
 * COMPILE-TIME contract: this package re-exports the Hub's `AppRouter` type and
 * derives per-procedure input/output types from it, so every spoke call site is
 * type-checked against the Hub's real router surface.
 *
 * This module contains ONLY `import type` / `export type` — it emits an empty
 * runtime `.js`, so nothing from hub-api (or @trpc) leaks into any spoke bundle.
 * The `AppRouter` type comes from hub-api's emitted, self-contained declaration
 * bundle (`hub-api/types/app-router` — the same artifact admin-portal consumes),
 * NEVER from hub-api source, so the spokes never deep-typecheck the Hub backend.
 */
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from 'hub-api/types/app-router'

// Re-export the Hub router type so spokes import it from one place.
export type { AppRouter }

/**
 * Every Hub procedure's INPUT type, keyed by dotted path
 * (e.g. `HubInputs['sync']['push']`, `HubInputs['lab']['verifyPatient']`).
 * Derived type-only from the real `AppRouter` — a renamed/removed procedure or a
 * changed input shape becomes a compile error at the call site.
 */
export type HubInputs = inferRouterInputs<AppRouter>

/**
 * Every Hub procedure's OUTPUT type, keyed by dotted path
 * (e.g. `HubOutputs['sync']['push']`, `HubOutputs['diagnosticReport']['listByPatient']`).
 * This is the AUTHORITATIVE unwrapped `result.data.json` shape the Hub returns —
 * spokes should type their `body.result.data.json` against this, not a hand-rolled
 * interface that can silently drift.
 */
export type HubOutputs = inferRouterOutputs<AppRouter>

export * from './wire-shapes'
export * from './dtos'
