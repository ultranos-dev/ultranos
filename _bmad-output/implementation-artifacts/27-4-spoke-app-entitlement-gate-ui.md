# Story 27.4: Spoke App Entitlement Gate UI

Status: done

## Story

As a user of a spoke app (OPD Lite, Pharmacy Lite, or Lab Lite),
I want a clear "module not available" screen when my organization hasn't subscribed to this app,
so that I understand why I can't access features and know whom to contact.

## Context

Story 27.3 adds the `enforceEntitlement` middleware and an `entitlement.check` query endpoint to the Hub API. This story builds the client-side soft gate: a shared `<EntitlementGate>` component in `@ultranos/ui-kit` that each spoke app wraps around its main content. On app load, the gate calls `entitlement.check` to verify the user's organization has an active subscription. If not, a full-screen blocking page is shown instead of the app content.

This is the "soft gate" in the defense-in-depth strategy. Even if this gate is bypassed (e.g., by a modified client), the API-level hard gate (Story 27.3) will reject requests. The UI gate exists for user experience, not security.

**Locked decisions (from Epic 27 architecture review):**
- Hard API gate + soft UI gate — defense in depth
- Patients are exempt (no org_id) — patient-facing apps don't use EntitlementGate
- EntitlementGate is a shared component in `@ultranos/ui-kit`

**PRD Requirements:** Epic 27 (Subscription & Tenant Management)

**Depends on:** Story 27.3 (entitlement middleware and `entitlement.check` endpoint must exist)

## Acceptance Criteria

1. A full-screen gate page is rendered with: the module name, a message ("Your organization has not subscribed to [Module Name]. Please contact your administrator."), and the organization Admin's contact email if available.
2. The user can still sign out from this gate page.
3. This gate is implemented as a shared `<EntitlementGate moduleCode={...}>` component in `@ultranos/ui-kit`, consumed by OPD Lite, Pharmacy Lite, and Lab Lite.
4. The entitlement status is checked once on app load, cached in the auth session store, and re-checked on session refresh.
5. The component is RTL-compatible and uses `@ultranos/ui-kit` design tokens.
6. When the app shell loads and the initial entitlement check returns `SUBSCRIPTION_REQUIRED`, the gate is shown instead of app content.

## Tasks / Subtasks

- [x] **Task 1: Create `<EntitlementGate>` component in ui-kit** (AC: #1, #2, #3, #5)
  - [x] Create `packages/ui-kit/src/EntitlementGate.tsx`.
  - [x] Component is a `'use client'` React component.
  - [x] Props interface:
    ```typescript
    export interface EntitlementGateProps {
      moduleCode: string
      moduleName: string
      status: 'active' | 'trial' | 'inactive' | 'checking' | null
      onSignOut: () => void
      adminEmail?: string
      children: React.ReactNode
    }
    ```
  - [x] When `status === 'checking'` or `status === null`: render a centered loading spinner/skeleton (not children).
  - [x] When `status === 'inactive'`: render the full-screen gate page (not children).
  - [x] When `status === 'active'` or `status === 'trial'`: render `{children}`.
  - [x] Gate page layout:
    - Centered vertically and horizontally using flexbox.
    - Module name displayed prominently (using `typography.fontSize.xl` / `fontWeight.bold`).
    - Message: "Your organization has not subscribed to {moduleName}. Please contact your administrator."
    - If `adminEmail` is provided, show: "Contact: {adminEmail}" as a `mailto:` link.
    - Sign out button styled with `colors.neutral` tokens, always visible at the bottom.
  - [x] Use only logical CSS properties for RTL compatibility: `margin-inline-start`/`end`, `padding-inline-start`/`end`, `text-align: start`/`end`.
  - [x] Use design tokens from `@ultranos/ui-kit` (`colors`, `typography`, `spacing`, `borderRadius`) — no hardcoded color values.

- [x] **Task 2: Export `EntitlementGate` from ui-kit index** (AC: #3)
  - [x] Add export to `packages/ui-kit/src/index.ts`:
    ```typescript
    export { EntitlementGate } from './EntitlementGate.js'
    export type { EntitlementGateProps } from './EntitlementGate.js'
    ```
  - [x] Build the package: `pnpm -F ui-kit build` to verify no errors.

- [x] **Task 3: Add `entitlementStatus` to auth session stores** (AC: #4)
  - [x] **OPD Lite** — `apps/opd-lite/src/stores/auth-session-store.ts`:
    - Add `entitlementStatus: 'active' | 'trial' | 'inactive' | 'checking' | null` to `AuthSessionState`.
    - Add `setEntitlementStatus(status)` action.
    - Initialize as `null`.
  - [x] **Pharmacy Lite** — `apps/pharmacy-lite/src/stores/auth-session-store.ts`:
    - Same changes as OPD Lite.
  - [x] **Lab Lite** — `apps/lab-lite/src/stores/auth-session-store.ts`:
    - Same changes as Lab Lite.
    - Note: Lab Lite's `AuthSession` interface has additional fields (`email`, `labName`, `technicianName`) — preserve those.

- [x] **Task 4: Create entitlement check hook** (AC: #4)
  - [x] Create `packages/ui-kit/src/useEntitlementCheck.ts` (or alternatively create per-app hooks if tRPC client import differs).
  - [x] **Decision:** Since each spoke app has its own tRPC client (`@/lib/trpc`), the hook cannot live in ui-kit without a tRPC dependency. Instead, create a minimal hook pattern that each app implements:
    - Create a reference implementation as a JSDoc comment in `EntitlementGate.tsx` showing the expected hook pattern.
    - Each spoke app creates its own `src/hooks/useEntitlementCheck.ts` that calls `trpc.entitlement.check.useQuery({ moduleCode })` and updates the auth session store.
  - [x] Hook behavior:
    - On mount: set `entitlementStatus` to `'checking'`, call `entitlement.check`, set result.
    - On session refresh (when `session` changes in auth store): re-check.
    - On error (network failure): set `entitlementStatus` to `'active'` (fail-open for UI gate — the API hard gate is the security boundary; blocking clinicians from their app due to a network blip is worse than showing UI they can't use).

- [x] **Task 5: Integrate EntitlementGate in OPD Lite** (AC: #3, #6)
  - [x] Create `apps/opd-lite/src/hooks/useEntitlementCheck.ts` with the tRPC-based hook.
  - [x] In `apps/opd-lite/src/components/AuthGuard.tsx` (or equivalent layout wrapper):
    - After authentication succeeds and session is set, call `useEntitlementCheck('OPD_LITE')`.
    - Wrap children with `<EntitlementGate moduleCode="OPD_LITE" moduleName="OPD Lite" status={entitlementStatus} onSignOut={handleSignOut}>`.
  - [x] The sign out handler should call `clearSession()` from auth store and redirect to `/login`.

- [x] **Task 6: Integrate EntitlementGate in Pharmacy Lite** (AC: #3, #6)
  - [x] Create `apps/pharmacy-lite/src/hooks/useEntitlementCheck.ts`.
  - [x] In `apps/pharmacy-lite/src/components/AuthGuard.tsx`:
    - Same pattern as OPD Lite but with `moduleCode="PHARMACY_LITE"` and `moduleName="Pharmacy Lite"`.

- [x] **Task 7: Integrate EntitlementGate in Lab Lite** (AC: #3, #6)
  - [x] Create `apps/lab-lite/src/hooks/useEntitlementCheck.ts`.
  - [x] In `apps/lab-lite/src/components/AuthGuard.tsx`:
    - Same pattern as OPD Lite but with `moduleCode="LAB_LITE"` and `moduleName="Lab Diagnostics Portal"`.

- [x] **Task 8: Write tests** (AC: #1-6)
  - [x] Create `packages/ui-kit/src/__tests__/EntitlementGate.test.tsx`.
  - [x] Tests for the shared component:
    - [x] Renders children when status is `'active'`.
    - [x] Renders children when status is `'trial'`.
    - [x] Renders gate page when status is `'inactive'`.
    - [x] Renders loading state when status is `'checking'`.
    - [x] Renders loading state when status is `null`.
    - [x] Gate page displays module name in the message.
    - [x] Gate page displays admin email as mailto link when provided.
    - [x] Gate page does not show admin email section when not provided.
    - [x] Sign out button is visible and clickable on gate page — verify `onSignOut` is called.
    - [x] RTL layout: verify logical CSS properties render correctly (snapshot or computed style check).
    - [x] No hardcoded color values — verify tokens are used (inspect inline styles).

## Dev Notes

### Architecture & Patterns

**AuthGuard as the integration point** — each spoke app already has an `AuthGuard` client component that wraps app content, checks Supabase session, and populates the auth session store. The `EntitlementGate` wraps inside the `AuthGuard` after authentication succeeds:

```
<AuthGuard>           ← checks Supabase session, populates auth store
  <EntitlementGate>   ← checks subscription status, shows gate or children
    {children}        ← actual app content
  </EntitlementGate>
</AuthGuard>
```

**Fail-open UI strategy** — the UI gate fails open (shows app content on network error). This is intentional:
- The API hard gate (Story 27.3) is the security boundary and never fails open.
- Blocking a clinician from accessing their app because the entitlement check network request failed would be a patient safety risk in offline-prone environments.
- The fail-open UI + fail-closed API = defense in depth without compromising availability.

**Per-app hooks instead of shared hook** — the entitlement check hook cannot be shared in `@ultranos/ui-kit` because each app has its own tRPC client instance (`@/lib/trpc`). The component is shared; the data-fetching hook is per-app.

**Auth session store extension pattern** — each store already has `session`, `isAuthenticated`, `setSession`, `clearSession`. Adding `entitlementStatus` follows the same pattern:

```typescript
interface AuthSessionState {
  // existing fields...
  entitlementStatus: 'active' | 'trial' | 'inactive' | 'checking' | null
  setEntitlementStatus: (status: 'active' | 'trial' | 'inactive' | 'checking') => void
}
```

**Component styling approach** — follow the existing pattern from `StaleDataBanner.tsx` and `ReAuthModal.tsx`: inline styles using token values from `./tokens.ts`. This avoids Tailwind dependency in the shared package while keeping styles co-located with the component.

```typescript
import { colors, typography, spacing, borderRadius } from './tokens'

// Gate page styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: spacing[8],
  backgroundColor: colors.neutral[50],
  textAlign: 'center',
}
```

### Project Structure Notes

**Files to create:**
| File | Purpose |
|------|---------|
| `packages/ui-kit/src/EntitlementGate.tsx` | Shared entitlement gate component |
| `packages/ui-kit/src/__tests__/EntitlementGate.test.tsx` | Component tests |
| `apps/opd-lite/src/hooks/useEntitlementCheck.ts` | OPD Lite entitlement check hook |
| `apps/pharmacy-lite/src/hooks/useEntitlementCheck.ts` | Pharmacy Lite entitlement check hook |
| `apps/lab-lite/src/hooks/useEntitlementCheck.ts` | Lab Lite entitlement check hook |

**Files to modify:**
| File | Change |
|------|--------|
| `packages/ui-kit/src/index.ts` | Export `EntitlementGate` and `EntitlementGateProps` |
| `apps/opd-lite/src/stores/auth-session-store.ts` | Add `entitlementStatus` field and `setEntitlementStatus` action |
| `apps/pharmacy-lite/src/stores/auth-session-store.ts` | Add `entitlementStatus` field and `setEntitlementStatus` action |
| `apps/lab-lite/src/stores/auth-session-store.ts` | Add `entitlementStatus` field and `setEntitlementStatus` action |
| `apps/opd-lite/src/components/AuthGuard.tsx` | Wrap children with `<EntitlementGate>` after auth check |
| `apps/pharmacy-lite/src/components/AuthGuard.tsx` | Wrap children with `<EntitlementGate>` after auth check |
| `apps/lab-lite/src/components/AuthGuard.tsx` | Wrap children with `<EntitlementGate>` after auth check |

**Files NOT to modify:**
- `apps/patient-lite-mobile/` — patients are exempt from entitlement checks (no org_id)
- `apps/opd-lite-mobile/` — scaffolded only, not active
- `packages/ui-kit/src/AppShell.tsx` — the gate sits outside/alongside AppShell, not inside it
- Layout files (`layout.tsx`) — the gate is integrated at the AuthGuard level, not at the layout level

### References

- AuthGuard pattern (Lab Lite): `apps/lab-lite/src/components/AuthGuard.tsx`
- AuthGuard pattern (OPD Lite): `apps/opd-lite/src/components/AuthGuard.tsx`
- Auth session store (OPD Lite): `apps/opd-lite/src/stores/auth-session-store.ts`
- Auth session store (Pharmacy Lite): `apps/pharmacy-lite/src/stores/auth-session-store.ts`
- Auth session store (Lab Lite): `apps/lab-lite/src/stores/auth-session-store.ts`
- UI-kit inline style pattern: `packages/ui-kit/src/StaleDataBanner.tsx`
- Design tokens: `packages/ui-kit/src/tokens.ts`
- UI-kit exports: `packages/ui-kit/src/index.ts`
- Entitlement check endpoint (Story 27.3): `apps/hub-api/src/trpc/routers/entitlement.ts` (to be created)
- Architecture decisions: `project_subscription_tenancy.md` in memory

## Testing

Run tests with:
```bash
pnpm -F ui-kit test -- EntitlementGate.test
```

Minimum 11 tests covering:
- **Rendering states:** Active shows children, trial shows children, inactive shows gate, checking shows loading, null shows loading
- **Gate content:** Module name displayed, admin email displayed when provided, admin email hidden when not provided
- **Interactions:** Sign out button calls `onSignOut` callback
- **RTL:** Logical CSS properties used (no `margin-left`/`padding-right` etc.)
- **Design tokens:** No hardcoded color values in styles

## Dev Agent Record

### Implementation Plan
- Created shared `<EntitlementGate>` component in `@ultranos/ui-kit` following inline-style + token pattern from `StaleDataBanner.tsx` and `ReAuthModal.tsx`
- Per-app `useEntitlementCheck` hooks using raw fetch to Hub API `entitlement.check` endpoint (matching existing tRPC client pattern — no React Query)
- Integrated gate inside each spoke app's `AuthGuard` component, wrapping children after auth succeeds
- Fail-open strategy on network error (consistent with defense-in-depth: UI gate = UX, API gate = security)

### Debug Log
- RTL test initially failed because jsdom expands `paddingInline` shorthand to physical `padding-left`/`padding-right` internally. Fixed test to inspect raw `style` attribute string instead of computed style values.

### Completion Notes
- All 8 tasks complete, all 11 EntitlementGate tests pass, full ui-kit regression suite passes (106 tests, 9 files)
- Build succeeds with no TypeScript errors
- Component uses design tokens exclusively (no hardcoded colors), logical CSS properties only (RTL-safe)
- Each spoke app gets its own `useEntitlementCheck` hook (per-app pattern due to tRPC client isolation)
- Patient app (`patient-lite-mobile`) correctly excluded — patients are exempt from entitlement checks

## File List

**Files created:**
- `packages/ui-kit/src/EntitlementGate.tsx`
- `packages/ui-kit/src/__tests__/EntitlementGate.test.tsx`
- `apps/opd-lite/src/hooks/useEntitlementCheck.ts`
- `apps/pharmacy-lite/src/hooks/useEntitlementCheck.ts`
- `apps/lab-lite/src/hooks/useEntitlementCheck.ts`

**Files modified:**
- `packages/ui-kit/src/index.ts`
- `apps/opd-lite/src/stores/auth-session-store.ts`
- `apps/pharmacy-lite/src/stores/auth-session-store.ts`
- `apps/lab-lite/src/stores/auth-session-store.ts`
- `apps/opd-lite/src/components/AuthGuard.tsx`
- `apps/pharmacy-lite/src/components/AuthGuard.tsx`
- `apps/lab-lite/src/components/AuthGuard.tsx`

### Review Findings

- [x] [Review][Patch] **No auth token sent; raw `fetch` bypasses `protectedProcedure` — gate is a no-op** — Fixed: added `Authorization: Bearer <token>` header via Supabase session. [all hooks]
- [x] [Review][Defer] **`adminEmail` never passed from any AuthGuard; API doesn't return it** — Deferred: "if available" = currently not available. Component supports it; wire when API returns adminEmail. [AuthGuard.tsx × 3]
- [x] [Review][Patch] Missing `@keyframes entitlement-spin` — spinner never animates — Fixed: added `ensureSpinKeyframes()` to inject CSS keyframe rule. [packages/ui-kit/src/EntitlementGate.tsx]
- [x] [Review][Patch] Unsafe type assertion on API response body — undefined status causes infinite spinner — Fixed: runtime validation of response shape with safe fallback. [all hooks]
- [x] [Review][Patch] `new URL()` throws on relative `NEXT_PUBLIC_HUB_API_URL` — fails open silently — Fixed: wrapped in try/catch with fail-open fallback. [all hooks]
- [x] [Review][Patch] No `AbortController` timeout on fetch — spinner hangs indefinitely on slow networks — Fixed: added 10s AbortController timeout with cleanup. [all hooks]
- [x] [Review][Defer] Lab-Lite AuthGuard hardcodes role as `'LAB_TECH'` regardless of JWT claims [apps/lab-lite/src/components/AuthGuard.tsx:49] — deferred, pre-existing

## Change Log

- 2026-05-13: Implemented Story 27.4 — Spoke App Entitlement Gate UI. Created shared `<EntitlementGate>` component, per-app entitlement check hooks, extended auth session stores, and integrated gate into all three spoke app AuthGuards. 11 component tests added.
