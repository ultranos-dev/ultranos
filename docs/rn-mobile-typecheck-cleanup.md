# React Native Mobile Apps — Typecheck Cleanup Backlog

**Status:** Deferred (not yet started). Documented 2026-09-21.
**Apps:** `apps/patient-lite-mobile/` (React Native) and `apps/opd-lite-mobile/` (Expo/React Native, scaffolded).

These two apps were intentionally left out of the monorepo typecheck cleanup that brought
hub-api, admin-portal, all shared packages, and the three web spoke apps (lab-lite,
opd-lite, pharmacy-lite) to **0 typecheck errors**. This file captures the exact state and
an actionable plan so a future session can finish them efficiently.

---

## TL;DR — the raw counts are misleading

| App | Raw `tsc` errors | In test files | Non-test | Genuine code issues (est.) |
|-----|-----------------:|--------------:|---------:|---------------------------:|
| patient-lite-mobile | **3704** | 3342 | 362 | **~300** |
| opd-lite-mobile | **408** | 351 | 57 | **~20** |

**~3700 of the ~4100 combined errors are a single missing dev dependency + tsconfig
config, not code bugs.** Both apps have `jest@^29` installed but **`@types/jest` is
missing**, and their `tsconfig` sets no `types` and `lib: ["ES2022"]` (no DOM). So every
`expect` / `it` / `describe` / `jest` / `beforeEach` in every test file is an "unknown
name" error, and every browser/DOM global (`document`, `window`, `crypto`, …) is too.

**Do the config/dependency fixes first (Phase 1–2). The real code-issue count only becomes
visible after that** — expect the totals to collapse from 3704→~300 and 408→~20.

---

## ⚠️ Environment hazard (read before running any install)

This repo lives under **OneDrive with Files-On-Demand**. Running `pnpm install` (which
Phase 1 and Phase 2 both require, to add `@types/jest` and missing RN deps) **de-hydrates
`node_modules` and shared-package `dist/` files into cloud-only placeholders**, which
breaks `tsc`/`vitest` and de-materializes tracked `packages/*/src`. This has caused
full-tree breakage twice.

**Recovery procedure after any install:**
```bash
git checkout -- packages/                       # restore de-materialized tracked src
pnpm install --force                            # re-fetch evicted store content (~40s)
pnpm -r --filter "./packages/*" build           # rebuild all shared dists
```
Verify a known-clean app still typechecks (`pnpm -F hub-api typecheck` → 0) before trusting
results. **Never run installs inside git worktrees or via parallel file-mutating agents**
(that is what triggered the incidents). Consider excluding the repo from OneDrive sync for
this work.

---

## Root-cause breakdown

### patient-lite-mobile (3704)

By error code:
- `TS2304` Cannot find name — **2310** (bulk = jest globals `expect`/`it`/`jest`/`describe`/`beforeEach`; plus DOM globals)
- `TS2582` Cannot find name (test runner) — **898** (`expect`/`it`/`describe` — "do you need @types/jest?")
- `TS2503` Cannot find namespace `jest` — **99**
- `TS2339` Property does not exist — **187** ← genuine code
- `TS2532` possibly undefined — **49** ← mostly genuine
- `TS2307` Cannot find module — **42** ← missing deps (below)
- `TS2769`/`TS2322`/`TS2345`/`TS7006` — ~51 ← genuine code
- `TS2584` (`document`/DOM) — 12, `TS2812` — 8

Top "Cannot find name": `expect` (1536), `it` (720), `jest` (616), `describe` (178),
`beforeEach` (69), then DOM/web globals `crypto` (16), `window` (13), `global` (12),
`document` (12), `TextEncoder` (9), `navigator` (4), `localStorage` (4), `DOMException`
(3), `sessionStorage`/`indexedDB` (2 each), `__dirname` (2), `Node` (2).

Missing modules (`TS2307`):
- `@react-navigation/native` (14), `@react-navigation/native-stack` (9),
  `@react-native-async-storage/async-storage` (9), `@react-native-community/netinfo` (3),
  `expo-localization` (1) — **declared? verify `apps/patient-lite-mobile/package.json`;
  these appear undeclared or uninstalled.**
- Workspace subpath issues: `@ultranos/crypto` (1), `@ultranos/crypto/mobile` (1),
  `@ultranos/ui-kit/utils/format` (1) — check the package `exports` maps expose these
  subpaths and the dist is built.
- Node built-ins `path` (1), `fs` (1) — need `@types/node` in `types`, or these are
  test-only/inappropriate in RN runtime code (review).

Worst test files: `notification-center.test.tsx` (126), `guardian-linking.test.tsx` (122),
`home-dashboard.test.tsx` (111), `onboarding-gateway.test.tsx` (100),
`dark-mode.test.tsx` (99), `fhir-humanizer.test.ts` (89), `export-records.test.tsx` (85),
`ProfileScreen.test.tsx` (85).

### opd-lite-mobile (408) — scaffolded

By error code: `TS2304` (236), `TS2582` (106), `TS2503` jest namespace (28), `TS2584`
DOM (12), `TS2812` (8), `TS2339` (8) ← genuine, `TS2769` (2), `TS2305` (2), `TS18046` (2),
`TS2532`/`TS2353`/`TS2347` (1 each). Same jest-globals + DOM-globals root cause; almost no
genuine code debt (it is scaffolded). `extends ../../tsconfig.base.json`.

---

## Recommended cleanup plan (ordered)

### Phase 1 — Test-runner + platform types (kills ~3700 errors)
1. Add `@types/jest` (matching `jest@29`) to devDependencies of **both** apps. (Alternative:
   migrate to `@jest/globals` explicit imports, but `@types/jest` global typing is the
   smaller change given the existing test style.)
2. In each app's `tsconfig.json`, set an explicit `types` array so test globals + Node are
   available, e.g. `"types": ["jest", "node", "react-native"]`. Add `@types/node` if not
   present.
3. For the DOM/web globals (`document`, `window`, `localStorage`, `crypto`, `TextEncoder`,
   `indexedDB`, …): decide per case —
   - **Test files** that render web-ish shims or use jsdom: add `"DOM"` to `lib` in a
     **test-scoped** tsconfig (do NOT add DOM to the app runtime tsconfig — RN has no DOM).
   - **Runtime code** referencing web globals is a red flag in an RN app: these should be
     RN equivalents or polyfills (e.g. `crypto`/`TextEncoder` via a shim). Review each; some
     may be genuine bugs (web code that leaked into the mobile app).
4. `pnpm install` → **run the recovery procedure above** → re-run typecheck. Expect
   plm ≈ 300–360, olm ≈ 20–57.

### Phase 2 — Missing dependency types (plm ~42)
1. Verify/declare the RN navigation + storage deps in `apps/patient-lite-mobile/package.json`
   (`@react-navigation/native`, `@react-navigation/native-stack`,
   `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`,
   `expo-localization`). Install (+ recovery).
2. Fix `@ultranos/crypto` / `@ultranos/crypto/mobile` / `@ultranos/ui-kit/utils/format`
   resolution — confirm those subpaths are in the packages' `exports` maps and the dists are
   built. (`@ultranos/crypto/mobile` implies a React Native entrypoint — see the SQLCipher /
   Android Keystore notes in CLAUDE.md.)

### Phase 3 — Genuine code issues (plm ~300, olm ~20)
Only now is the real list visible. Known examples already surfaced:
- `src/components/AllergyBanner.tsx:33,62` — `Property 'reaction' does not exist` on the
  FHIR `AllergyIntolerance` shape from `@ultranos/shared-types`. **Allergy display is a
  safety-critical path (CLAUDE.md Rule #4)** — confirm whether `reaction` should exist on
  the shared type (add it) or the component is reading the wrong field. Do not paper over.
- `src/components/dashboard/ProfileCompletionCard.tsx:121,123` — `Property 'md'` missing on
  a spacing-token object (`{ touchTarget, cardPadding, sectionGap, screenPadding }`) — token
  name mismatch; align with `@ultranos/ui-kit/tokens.native` (see CLAUDE.md "Native Design
  Tokens").
- Remaining `TS2339`/`TS2532`/`TS7006`/`TS2322`/`TS2345` — fix with real typing/narrowing,
  not `as any`. Follow the same discipline used for hub-api (no masking; flag anything that
  looks like a real bug rather than guessing).

### Phase 4 — Verify
- `pnpm -F patient-lite-mobile typecheck` and `pnpm -F opd-lite-mobile typecheck` → 0.
- Run the RN test suites (Jest) and confirm green — the Phase 1 type changes are config-only
  and should not change runtime, but verify.
- Re-run a known-clean app typecheck to confirm no de-hydration damage lingers.

---

## Guardrails (same as the web cleanup)
- No masking (`as any` / `@ts-ignore`) unless there is genuinely no typed alternative, with a
  one-line reason. Prefer real typing / narrowing.
- No runtime behavior change while fixing types.
- Allergy / consent / medication paths are safety-critical — extra care, dedicated review.
- Verify against source before claiming a fix; flag suspected real bugs instead of guessing.
- Native token usage must come from `@ultranos/ui-kit/tokens.native` (no hardcoded hex / raw
  px / string font names) per CLAUDE.md.

## Reference
- Web cleanup that reached 0 (patterns to mirror): commits on `feat/facility-enterprise-profiles`
  around the hub-api middleware / audit-vocabulary / AppRouter-bundle work.
- Native design tokens + fonts + Metro config: see CLAUDE.md "Native Design Tokens".
