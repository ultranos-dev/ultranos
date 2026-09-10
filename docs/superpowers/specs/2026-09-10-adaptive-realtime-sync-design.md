# Adaptive Real-Time Sync — Design

- **Date:** 2026-09-10
- **Status:** Design — approved for spec review
- **Scope:** `packages/sync-engine`, `apps/hub-api`, and the four spoke apps
  (`opd-lite`, `pharmacy-lite`, `lab-lite`, `patient-lite-mobile`)

## Problem

Sync is time-driven polling in both directions, with no server→spoke push:

- **Push (spoke → Hub):** `setInterval` drain every 30s
  (`packages/sync-engine/src/drain-worker.ts:66`), immediate only on
  `online`/tab-focus events.
- **Pull (Hub → spoke):** background pull every 2 min for the active chart,
  5 min for the directory
  (`apps/opd-lite/src/components/providers/SyncProvider.tsx:194`).
- **Hub is strictly pull-only** — no SSE/WebSocket/Realtime; it cannot tell a
  spoke that new data has landed.

Result: even on consistent, healthy connectivity the end-to-end latency is
~60–120s typical, ~2.5 min worst case. The intervals exist to survive bad
networks but penalize good ones unconditionally.

## Goal

When connectivity is consistent, collapse latency toward near-instant —
**without** weakening the offline-first guarantee, the conflict-resolution
tiers, or the PHI/consent enforcement model.

## Verified context (ground truth, 2026-09-10)

- Hub is **Next.js 15 + tRPC 11** (`fetchRequestHandler`), run as a
  **long-running Node process** (`next start`), not serverless — long-lived
  connections are viable.
- Datastore is **Supabase** (`@supabase/supabase-js`, `SUPABASE_URL`);
  **Redis is really wired** (`ioredis`: rate-limit, cron locks, OTP nonces).
- No existing realtime/SSE/WebSocket anywhere; request-response only.
- Auth is **Supabase JWT** verified in tRPC middleware
  (`apps/hub-api/src/trpc/init.ts`), then app-layer RBAC.

## Principle

Real-time is an **enhancement layer over an untouched offline-first poll
floor.** The durable queue and poll loop remain the source of truth for
delivery. Every added layer degrades silently to today's behavior if it
fails. Offline-first is non-negotiable.

```
Local write ──► Queue ──► [event-driven drain] ──► Hub (sync.push)
                  ▲                                     │
        [Connectivity Manager]                    commits change
        offline | degraded | healthy                    │
                  │                          publish PHI-free nudge (service role)
Incremental pull ◄── [SignalClient] ◄── Supabase Realtime channel
        └──────────► existing sync.pull (UNCHANGED: RBAC, consent, encryption, HLC, tiers)
```

The Realtime channel carries only `{ topic, resourceTypes, maxHlc }` — **no
PHI**. It collapses the pull wait; the actual data still travels the existing
encrypted, consent-enforced `sync.pull`. The Hub remains the single
enforcement point.

---

## Phase 1 — client-only quick wins

**No backend change. All four apps.** Delivers most of the latency win at low
risk; can ship independently.

### 1.1 Connectivity Manager (new shared module)

`packages/sync-engine/src/connectivity-manager.ts`

- Classifies state: `offline | degraded | healthy`.
- **Passive only — no dedicated health probes** (the target environment is
  metered/low-resource; probes would burn the scarce data/battery the product
  exists to conserve). State is inferred from:
  - outcomes + latency (EWMA) of syncs the app was already performing;
  - rolling failure rate;
  - `navigator.onLine` (web) / NetInfo (RN);
  - when a realtime channel is open, its heartbeat doubles as liveness.
- Exposes `getState()` and `subscribe(listener)`; emits transitions.
- Thresholds are configurable with conservative defaults (the `degraded`
  middle state is the most likely to need tuning — start cautious).

### 1.2 Event-driven push

- On enqueue, if state is `healthy`, schedule a **debounced drain (~300ms)**
  to batch bursts, instead of waiting for the 30s tick.
- **Tier-1** items (allergies, active meds, consent) use a near-zero debounce.
- The 30s interval remains as a safety net; the debounce never replaces it.
- Durability unchanged: a failed drain leaves items queued.

### 1.3 Batched drain

- The drain currently sends operations **one at a time**
  (`drain-worker.ts:104`) although `sync.push` already accepts **50 per
  request** (`apps/hub-api/src/trpc/routers/sync.ts`, `.max(50)`).
- Send in batches up to 50 — fewer round-trips, better throughput. Preserve
  per-operation result handling and per-resource dedup.

### 1.4 Passive adaptive cadence

Replace the fixed 30s / 2min / 5min constants with state-driven schedules:

| State | Push | Pull |
|-------|------|------|
| `healthy` | event-driven (poll interval *lengthened* as a safety net) | short interval (~10–15s) |
| `degraded` | back off (~60s) | back off (~5 min) |
| `offline` | pause network attempts (battery); resume on `online` | paused |

Add **jitter** so many devices don't stampede the Hub together. All intervals
become configuration with sane defaults in `sync-engine`; apps may override.

**Phase 1 outcome:** push-side latency → sub-second; pull-side → ~10–15s on
healthy networks; zero backend work.

---

## Phase 2 — Supabase Realtime signal

**Transport: Supabase Realtime (Broadcast mode).** Chosen over hand-rolled
SSE+Redis because the datastore is already Supabase and it provides connection
management, multi-instance fan-out, auto-reconnect, and **native web + React
Native** client support for free — removing the need for a Redis fan-out layer
(SSE would have pinned connections to one Node instance) and an RN
`EventSource` polyfill. Trade-off accepted: deeper Supabase coupling.

**In-scope apps:** desktop PWAs — **OPD-Lite, Pharmacy-Lite, Lab-Lite.**
Patient-Lite-Mobile stays on Phase 1 adaptive polling (see below).

### 2.1 Scope — cross-app clinical handoffs only

The signal layer is **not** "subscribe every open chart." It targets the flows
where minutes of lag have real clinical cost, each with a justification:

- **Lab result ready → OPD** physician sees it live.
- **Prescription issued → Pharmacy** queue updates live.
- **Allergy / consent change → propagation** (safety-positive).

### 2.2 Hub (publisher)

- On `sync.push` commit, the Hub publishes a **PHI-free nudge**
  `{ topic, resourceTypes, maxHlc }` to the relevant Supabase Realtime
  channel(s), server-side using the service-role client.
- `topic` is an opaque id (org/facility/patient/role stream) already used in
  URLs; the payload never contains names or clinical content.
- Logging stays opaque ids/counts only (PHI-in-logs rule).

### 2.3 Client (subscriber)

- New `SignalClient` in `packages/sync-engine` wrapping the Supabase Realtime
  client. Subscribes to **Hub-authorized channels**; topic subscriptions
  update as the user navigates.
- On a nudge, trigger the existing incremental `sync.pull` for that topic with
  the current `sinceHlc`. **The pull path is entirely unchanged.**
- **Signal→pull coalescing:** debounce the handler so a burst of writes on
  device A collapses to a single pull on device B (avoid trading poll-lag for
  pull-storms).
- Fallback: if the channel drops or state degrades, adaptive polling (Phase 1)
  takes over. Realtime is purely an accelerator.
- Feature-flagged per app so Phase 2 rolls out app-by-app.

### 2.4 Patient-Lite-Mobile — polling only

Holding a realtime socket open on a flaky, metered mobile link risks
connect/disconnect flapping and battery/data cost that outweigh the benefit.
Patient-mobile relies on Phase 1 adaptive polling and opens a socket only on
good/wifi connectivity (future consideration, not this phase).

---

## Safety, consent & security

- **Faster ≠ less safe.** Conflict-resolution tiers, the 60s conflict window,
  and Tier-1 prescription-blocking are unchanged; faster propagation of
  allergies/consent is safety-positive.
- **Consent enforced twice:** at subscribe (Hub authorizes the channel,
  mirroring its consent/RBAC logic) and again at pull (existing enforcement as
  backstop). A stray nudge for an unauthorized topic yields an empty pull.
- **Channel authorization must mirror Hub consent enforcement.** Consent is an
  append-only ledger; channel scoping must not out-run it. The pull re-enforces
  as the safety net.
- **No PHI on the wire or in logs.** Nudges carry opaque ids + resource-type
  lists + HLC only. Field-level PHI encryption is untouched (data flows only
  through `sync.pull`).
- **Data minimization (Lab):** lab-facing nudges must not encode more than the
  lab is entitled to; the nudge is a resource-type + HLC, not patient data.

## Testing

- **Connectivity Manager:** unit tests for state transitions under simulated
  latency/failure sequences; assert no dedicated network probes are emitted.
- **Event-driven push:** debounce batching; Tier-1 near-zero debounce; batched
  drain sends ≤50/request; safety-net poll still fires; failed drain re-queues.
- **Realtime signal:** integration — write on device A → device B pulls within
  a latency budget; signal→pull coalescing collapses bursts to one pull.
- **Resilience:** channel drop → poll fallback; reconnect resumes; Realtime
  channel down never blocks offline writes.
- **Authorization:** consent-scoped channel subscribe is denied when
  unauthorized; unauthorized nudge yields empty pull.
- **Regression:** all existing offline-persistence and conflict-resolution
  tests preserved and green.

## Open items

1. **Audit on subscribe:** does opening a patient-chart / handoff subscription
   warrant its own audit event (access intent)? Decide during implementation.
2. **Adaptive-cadence thresholds:** exact `degraded`/`healthy` boundaries and
   EWMA window — start conservative, tune with field data.
3. **Realtime channel-authorization mechanism:** confirm how Supabase channel
   authorization will be driven from Hub-issued claims vs a Hub-brokered
   subscribe handshake — to be finalized in the implementation plan.

## Out of scope

- Replacing the poll loop or the queue (they remain the offline-first floor).
- Same-chart real-time co-editing / presence.
- Streaming PHI over any realtime channel.
- Patient-Lite-Mobile realtime channel (polling only this cycle).
