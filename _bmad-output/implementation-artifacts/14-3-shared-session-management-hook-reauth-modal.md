# Story 14.3: Shared Session Management Hook & Re-Auth Modal

Status: done

## Story

As a developer,
I want a shared `useSessionManager` hook and re-auth modal component in `@ultranos/ui-kit`,
so that all spoke apps enforce session duration and inactivity timeout consistently.

## Acceptance Criteria

1. `useSessionManager({ maxDurationMs, inactivityMs, onExpired, onReAuth })` is exported from `@ultranos/ui-kit`
2. The hook tracks mouse movement, key press, and touch events to reset the inactivity timer
3. A "Session expiring in 5 minutes" warning toast is shown before inactivity timeout
4. A re-authentication modal requiring password re-entry is rendered when inactivity threshold is reached
5. `onExpired` callback fires when max session duration is reached (consumer app clears auth state, redirects to login)
6. Role-specific durations are configurable: 8h CLINICIAN/DOCTOR, 12h PHARMACIST, 4h ADMIN, 8h LAB_TECH
7. The hook clears PHI state via `onExpired` callback (consumer app is responsible for Zustand stores + encryption key wipe)
8. Re-auth modal verifies password via Supabase Auth `signInWithPassword` and refreshes the session
9. All new components and hooks have comprehensive unit tests

## Tasks / Subtasks

- [x] Task 1: Create `useSessionManager` hook (AC: #1, #2, #5, #6)
  - [x] Create `packages/ui-kit/src/useSessionManager.ts`
  - [x] Accept config: `{ maxDurationMs, inactivityMs, onExpired, onReAuth, onWarning? }`
  - [x] Track activity via `mousemove`, `keydown`, `touchstart`, `mousedown`, `scroll` events on `document`
  - [x] Throttle event listeners (1-second throttle) to avoid performance overhead
  - [x] Maintain two timers: (a) inactivity countdown, (b) absolute session duration countdown
  - [x] Inactivity timer resets on any tracked user activity
  - [x] Absolute session timer never resets — fires `onExpired` when max duration reached
  - [x] Return `{ sessionState, resetInactivity, forceExpire }` where `sessionState` is `'active' | 'warning' | 'locked' | 'expired'`
  - [x] Transition: active → warning (5 min before inactivity timeout) → locked (inactivity reached) → expired (max duration or re-auth failed)
  - [x] `onExpired` fires on max duration hit — consumer app handles cleanup + redirect
  - [x] Clean up all event listeners and timers on unmount

- [x] Task 2: Create `SessionWarningToast` component (AC: #3)
  - [x] Create `packages/ui-kit/src/SessionWarningToast.tsx`
  - [x] Show "Session expiring in X minutes" countdown when `sessionState === 'warning'`
  - [x] Use inline styles (consistent with StaleDataBanner pattern — no Tailwind in ui-kit)
  - [x] Fixed position bottom-right, yellow/amber warning color scheme
  - [x] Auto-dismiss when user activity resets the timer (state returns to 'active')
  - [x] Accessible: `role="alert"`, `aria-live="polite"`
  - [x] Include "Stay signed in" button that calls `resetInactivity()`

- [x] Task 3: Create `ReAuthModal` component (AC: #4, #8)
  - [x] Create `packages/ui-kit/src/ReAuthModal.tsx`
  - [x] Render when `sessionState === 'locked'`
  - [x] Modal overlay with password input field
  - [x] Accept `onReAuth: (password: string) => Promise<boolean>` callback — consumer app handles Supabase verification
  - [x] On successful re-auth: call `resetInactivity()`, return to 'active' state
  - [x] On failed re-auth: show "Invalid password" error, allow retry
  - [x] "Sign Out" button that calls `onExpired` (forced logout)
  - [x] Display authenticated user's email (passed as prop, NOT fetched internally)
  - [x] Modal traps focus (keyboard accessible), closes on ESC only via Sign Out
  - [x] Use inline styles consistent with ui-kit patterns
  - [x] Accessible: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`

- [x] Task 4: Create `SessionManagerProvider` convenience wrapper (AC: #1)
  - [x] Create `packages/ui-kit/src/SessionManagerProvider.tsx`
  - [x] Wraps children with `useSessionManager` hook and renders warning toast + re-auth modal automatically
  - [x] Props: `{ maxDurationMs, inactivityMs, onExpired, onReAuth, userEmail, children }`
  - [x] This is a convenience component — apps can also use the hook directly for custom UI

- [x] Task 5: Export new modules from ui-kit (AC: #1)
  - [x] Update `packages/ui-kit/src/index.ts` to export:
    - `useSessionManager` hook + `UseSessionManagerConfig` type + `SessionState` type
    - `SessionWarningToast` component + `SessionWarningToastProps` type
    - `ReAuthModal` component + `ReAuthModalProps` type
    - `SessionManagerProvider` component + `SessionManagerProviderProps` type
    - `SESSION_DURATIONS` constants object (role → ms mapping)
  - [x] Run `pnpm -F ui-kit build` to verify exports compile

- [x] Task 6: Export role-specific duration constants (AC: #6)
  - [x] Add to `useSessionManager.ts`:
    ```
    export const SESSION_DURATIONS = {
      CLINICIAN: 8 * 60 * 60 * 1000,
      DOCTOR: 8 * 60 * 60 * 1000,
      PHARMACIST: 12 * 60 * 60 * 1000,
      ADMIN: 4 * 60 * 60 * 1000,
      LAB_TECH: 8 * 60 * 60 * 1000,
    } as const
    ```
  - [x] Export `INACTIVITY_TIMEOUT = 30 * 60 * 1000` (30 minutes — consistent across all roles per NFR10)
  - [x] Export `WARNING_BEFORE_MS = 5 * 60 * 1000` (5-minute warning before lock)

- [x] Task 7: Write tests (AC: #9)
  - [x] Create `packages/ui-kit/src/__tests__/useSessionManager.test.ts`
  - [x] Test inactivity timer resets on user activity (mousemove, keydown, touchstart)
  - [x] Test warning state triggers at (inactivityMs - 5min)
  - [x] Test locked state triggers at inactivityMs
  - [x] Test expired state triggers at maxDurationMs
  - [x] Test `onExpired` callback fires on max duration
  - [x] Test `onReAuth` callback integration
  - [x] Test cleanup on unmount (no lingering timers/listeners)
  - [x] Create `packages/ui-kit/src/__tests__/SessionWarningToast.test.tsx`
  - [x] Test renders countdown text
  - [x] Test "Stay signed in" button calls resetInactivity
  - [x] Test accessible attributes (role="alert")
  - [x] Create `packages/ui-kit/src/__tests__/ReAuthModal.test.tsx`
  - [x] Test renders password field and buttons
  - [x] Test successful re-auth flow
  - [x] Test failed re-auth shows error
  - [x] Test "Sign Out" calls onExpired
  - [x] Test focus trap and keyboard accessibility
  - [x] Verify all existing ui-kit tests pass

### Review Findings

- [x] [Review][Decision] `onReAuth` dead code in hook config — removed from `UseSessionManagerConfig`, kept on `SessionManagerProviderProps` only (Option A)
- [x] [Review][Patch] Toast RTL fix — replaced `right`/`bottom` with `insetInlineEnd`/`insetBlockEnd` [SessionWarningToast.tsx:25]
- [x] [Review][Patch] ESC key triggers Sign Out — added Escape handler to ReAuthModal [ReAuthModal.tsx:26]
- [x] [Review][Patch] `onReAuth` exception catch — added catch block with user-facing error message [ReAuthModal.tsx:59]
- [x] [Review][Patch] `Math.ceil`/`Math.floor` inconsistency — unified to `Math.ceil` [useSessionManager.ts:52,80]
- [x] [Review][Patch] Focus trap test — added Tab key simulation and ESC key test [ReAuthModal.test.tsx:69-86]
- [x] [Review][Defer] `inactivityMs < WARNING_BEFORE_MS` edge case — deferred, won't occur with spec-defined 30min constant
- [x] [Review][Defer] No `SessionManagerProvider` test file — deferred, integration coverage in stories 14.3a/b/c

## Dev Notes

### Design Principles

**The hook is app-agnostic.** It knows nothing about Supabase, Zustand stores, encryption keys, or IndexedDB. It only manages timers and state transitions. Consumer apps (OPD Lite, Pharmacy Lite, Lab Lite) wire it to their own auth/PHI cleanup logic via callbacks.

**Why callbacks, not direct dependencies:**
- OPD Lite has 6 Zustand stores with `clearPhiState()` + `encryptionKeyStore.wipe()` + `useAuthSessionStore.clearSession()`
- Pharmacy Lite has `encryptionKeyStore.wipe()` + `useAuthSessionStore.clearSession()` + `stopAuditDrain()`
- Lab Lite has NO auth session store — just `supabase.auth.signOut()` and redirect
- The hook cannot import app-specific stores — it lives in `packages/ui-kit/`

**Why NOT use `react-idle-timer` library:**
- ui-kit has zero runtime dependencies (only React peer deps)
- The idle detection logic is straightforward (~50 lines)
- Adding a dependency to a shared package creates version management burden across all apps
- Custom implementation gives full control over the state machine

### State Machine

```
                 ┌─────────────┐
                 │   ACTIVE     │ ← user activity resets inactivity timer
                 └──────┬───────┘
                        │ (inactivityMs - WARNING_BEFORE_MS) elapsed
                        ▼
                 ┌─────────────┐
                 │   WARNING    │ ← toast shown "Session expiring in X min"
                 └──────┬───────┘
                        │ inactivityMs elapsed (or user clicks "Stay signed in")
           ┌────────────┼────────────┐
           │            │            │
    user activity    timeout      maxDurationMs
    resets to       reached       reached
    ACTIVE                        anywhere
           │            │            │
           ▼            ▼            ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │  ACTIVE  │ │  LOCKED  │ │ EXPIRED  │
     └──────────┘ └────┬─────┘ └──────────┘
                       │         onExpired()
              ┌────────┼────────┐
              │                 │
         re-auth OK       re-auth fail / Sign Out
              │                 │
              ▼                 ▼
        ┌──────────┐     ┌──────────┐
        │  ACTIVE  │     │ EXPIRED  │
        └──────────┘     └──────────┘
```

**Key transitions:**
- `active → warning`: when `(inactivityMs - WARNING_BEFORE_MS)` of no activity. WARNING_BEFORE_MS = 5 minutes.
- `warning → active`: any user activity (mousemove, keydown, touchstart, etc.)
- `warning → locked`: inactivityMs fully elapsed with no activity
- `locked → active`: successful re-auth via `onReAuth` callback
- `locked → expired`: re-auth failure or user clicks "Sign Out"
- `ANY → expired`: maxDurationMs absolute timer fires (non-resettable)

### Hook API Design

```typescript
export type SessionState = 'active' | 'warning' | 'locked' | 'expired'

export interface UseSessionManagerConfig {
  /** Absolute max session duration (ms). Never resets. */
  maxDurationMs: number
  /** Inactivity timeout (ms). Resets on user activity. */
  inactivityMs: number
  /** Called when session must be terminated (max duration or forced logout). App must clear auth/PHI state and redirect. */
  onExpired: () => void
  /** Called when user re-authenticates from locked state. Returns true if password is valid. */
  onReAuth: (password: string) => Promise<boolean>
  /** Optional: called when entering warning state. For custom toast implementations. */
  onWarning?: () => void
}

export interface UseSessionManagerReturn {
  /** Current session state */
  sessionState: SessionState
  /** Remaining seconds before lock (only meaningful in 'warning' state) */
  remainingSeconds: number
  /** Manually reset the inactivity timer (e.g., "Stay signed in" button) */
  resetInactivity: () => void
  /** Force session expiry (e.g., explicit sign-out) */
  forceExpire: () => void
}
```

### Component Patterns — Match Existing ui-kit Style

**ui-kit uses inline styles, NOT Tailwind.** See `StaleDataBanner.tsx` and `ErrorBoundary.tsx` for the pattern. All components use:
- `'use client'` directive (React client components)
- Inline `style={{}}` objects
- `role` and `aria-*` attributes for accessibility
- No external CSS or Tailwind classes
- No external dependencies beyond React

**SessionWarningToast styling (match StaleDataBanner amber scheme):**
```typescript
// Fixed position, bottom-right
style={{
  position: 'fixed',
  bottom: '1rem',
  right: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  backgroundColor: '#fef9c3',  // amber-50
  border: '1px solid #facc15',  // amber-400
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  color: '#854d0e',  // amber-800
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  zIndex: 9998,
}}
```

**ReAuthModal styling:**
```typescript
// Overlay
style={{
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 9999,
}}
// Modal card — match ErrorBoundary's card pattern
style={{
  backgroundColor: 'white',
  borderRadius: '0.5rem',
  padding: '1.5rem',
  maxWidth: '24rem',
  width: '100%',
  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
}}
```

### Activity Event Handling

```typescript
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'mousedown', 'scroll'] as const

// Throttle to 1 event per second to avoid perf issues
let lastActivityTime = Date.now()
function handleActivity() {
  const now = Date.now()
  if (now - lastActivityTime < 1000) return  // 1-second throttle
  lastActivityTime = now
  // Reset inactivity timer
}

// Register on document (captures all events regardless of focus)
useEffect(() => {
  ACTIVITY_EVENTS.forEach(evt => document.addEventListener(evt, handleActivity, { passive: true }))
  return () => {
    ACTIVITY_EVENTS.forEach(evt => document.removeEventListener(evt, handleActivity))
  }
}, [])
```

**IMPORTANT:** Use `{ passive: true }` for all event listeners to avoid performance warnings. Use `document` level, not `window`, for consistent cross-browser behavior.

### Timer Implementation

Use `setInterval` with 1-second tick for countdown display accuracy:
```typescript
const tickRef = useRef<ReturnType<typeof setInterval>>()

useEffect(() => {
  tickRef.current = setInterval(() => {
    const elapsed = Date.now() - lastActivityTime
    // Update remainingSeconds for countdown display
    // Check thresholds for state transitions
  }, 1000)
  return () => clearInterval(tickRef.current)
}, [])
```

For the absolute session timer, use a single `setTimeout` set once on mount:
```typescript
const sessionTimerRef = useRef<ReturnType<typeof setTimeout>>()
useEffect(() => {
  sessionTimerRef.current = setTimeout(() => {
    onExpired()
  }, maxDurationMs)
  return () => clearTimeout(sessionTimerRef.current)
}, [maxDurationMs, onExpired])
```

### ReAuthModal — Password Verification Pattern

The modal does NOT import Supabase directly. It accepts an `onReAuth` callback that the consumer app provides. The consumer app's callback does:

```typescript
// Example consumer app callback (NOT in ui-kit):
async function handleReAuth(password: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return false
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  })
  return !error
}
```

This keeps Supabase as an app-level concern, not a ui-kit dependency.

### Focus Trap for ReAuthModal

Implement a minimal focus trap without external dependencies:
```typescript
function trapFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const modal = modalRef.current
  if (!modal) return
  const focusable = modal.querySelectorAll<HTMLElement>(
    'input, button, [tabindex]:not([tabindex="-1"])'
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
```

### Consumer App Integration Pattern (for Stories 14.3a/b/c)

Each spoke app will wire this hook in their layout:

```typescript
// Example: apps/opd-lite/src/app/layout.tsx (Story 14.3a — NOT this story)
import { SessionManagerProvider, SESSION_DURATIONS, INACTIVITY_TIMEOUT } from '@ultranos/ui-kit'

// In layout:
<SessionManagerProvider
  maxDurationMs={SESSION_DURATIONS[session.role] ?? SESSION_DURATIONS.CLINICIAN}
  inactivityMs={INACTIVITY_TIMEOUT}
  userEmail={session.email}
  onExpired={() => {
    // Clear all PHI state
    useEncounterStore.getState().clearPhiState()
    useVitalsStore.getState().clearPhiState()
    // ... other stores
    encryptionKeyStore.wipe()
    useAuthSessionStore.getState().clearSession()
    supabase.auth.signOut()
    window.location.href = '/login'
  }}
  onReAuth={async (password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: session.email, password })
    return !error
  }}
>
  {children}
</SessionManagerProvider>
```

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `packages/ui-kit/src/useSessionManager.ts` | NEW | Hook with timer logic, state machine, constants |
| `packages/ui-kit/src/SessionWarningToast.tsx` | NEW | Warning toast component |
| `packages/ui-kit/src/ReAuthModal.tsx` | NEW | Re-auth modal with password field |
| `packages/ui-kit/src/SessionManagerProvider.tsx` | NEW | Convenience wrapper combining hook + UI |
| `packages/ui-kit/src/index.ts` | UPDATE | Export new modules |
| `packages/ui-kit/src/__tests__/useSessionManager.test.ts` | NEW | Hook tests |
| `packages/ui-kit/src/__tests__/SessionWarningToast.test.tsx` | NEW | Toast component tests |
| `packages/ui-kit/src/__tests__/ReAuthModal.test.tsx` | NEW | Modal component tests |

### What NOT to Change

- DO NOT add any runtime dependencies to `packages/ui-kit/package.json` — keep zero deps (React is a peer dep)
- DO NOT import Supabase, Zustand, Dexie, or any app-specific code in ui-kit
- DO NOT use Tailwind classes — ui-kit uses inline styles
- DO NOT modify any app code (OPD Lite, Pharmacy Lite, Lab Lite) — integration is Stories 14.3a/b/c
- DO NOT use `localStorage` or `sessionStorage` for timer state — memory only
- DO NOT add `react-idle-timer` or any external idle detection library
- DO NOT log session state transitions to console — CLAUDE.md PHI rules

### What This Story Does NOT Do

- Does NOT integrate the hook into OPD Lite (Story 14.3a)
- Does NOT integrate the hook into Pharmacy Lite (Story 14.3b)
- Does NOT integrate the hook into Lab Lite (Story 14.3c)
- Does NOT add route protection (Story 14.5)
- Does NOT add the AppShell navbar (Story 14.4)

### Existing PHI Cleanup Patterns (for consumer reference — NOT implemented in this story)

OPD Lite has these `clearPhiState()` methods across stores:
- `useEncounterStore.getState().clearPhiState()`
- `useVitalsStore.getState().clearPhiState()`
- `useDiagnosisStore.getState().clearPhiState()`
- `useSoapNoteStore.getState().clearPhiState()`
- `usePrescriptionStore.getState().clearPhiState()`
- `useAllergyStore.getState().clearPhiState()`
- `encryptionKeyStore.wipe()`
- `useAuthSessionStore.getState().clearSession()`

Pharmacy Lite has:
- `encryptionKeyStore.wipe()`
- `useAuthSessionStore.getState().clearSession()`
- `stopAuditDrain()`

Lab Lite has:
- `supabase.auth.signOut()` (no auth session store, no encryption key store)

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured in ui-kit)
- **Timer mocking:** Use `vi.useFakeTimers()` / `vi.advanceTimersByTime()` for timer-based tests
- **Event simulation:** Use `document.dispatchEvent(new MouseEvent('mousemove'))` for activity events
- **Modal tests:** Use `@testing-library/react` with `screen.getByRole('dialog')` for accessibility
- **Cleanup verification:** Assert no lingering timers/listeners after unmount via `vi.getTimerCount()`

### Edge Cases to Handle

1. **Multiple mounts:** If hook is mounted in multiple components, each instance manages its own timers. Use `SessionManagerProvider` at layout level to avoid duplicates.
2. **Tab visibility:** When tab is hidden (`document.hidden`), timers still fire. This is correct — inactivity should trigger even if the tab is backgrounded (security requirement).
3. **System sleep/wake:** `setInterval` pauses during system sleep. On wake, the interval callback fires with a large elapsed time delta, which correctly triggers timeout. No special handling needed.
4. **maxDurationMs < inactivityMs:** Valid configuration (session expires before inactivity could trigger). The absolute timer fires `onExpired` first.
5. **Re-auth during warning:** If user is in 'warning' state and completes re-auth preemptively, treat as activity reset.

### Project Structure Notes

- All new files in `packages/ui-kit/src/` following existing flat structure
- Tests in `packages/ui-kit/src/__tests__/` following existing pattern
- Exports from `packages/ui-kit/src/index.ts` using named exports
- Build via `pnpm -F ui-kit build` (tsc compilation to `dist/`)

### References

- [Source: packages/ui-kit/src/index.ts] — Current exports (ADD new exports here)
- [Source: packages/ui-kit/src/StaleDataBanner.tsx] — Inline style pattern, accessibility, component structure (MATCH THIS)
- [Source: packages/ui-kit/src/ErrorBoundary.tsx] — Component pattern, 'use client' directive
- [Source: packages/ui-kit/package.json] — Zero runtime deps, React peer deps (PRESERVE THIS)
- [Source: packages/ui-kit/tsconfig.json] — Build config (jsx: react-jsx, outDir: dist)
- [Source: apps/opd-lite/src/stores/auth-session-store.ts] — Consumer auth store pattern
- [Source: apps/opd-lite/src/lib/encryption-key-store.ts] — Consumer PHI wipe pattern
- [Source: apps/opd-lite/src/stores/encounter-store.ts] — clearPhiState + beforeunload pattern
- [Source: _bmad-output/planning-artifacts/epics.md#Story14.3] — AC source
- [Source: _bmad-output/planning-artifacts/epics.md#NFR9] — Session duration enforcement
- [Source: _bmad-output/planning-artifacts/epics.md#NFR10] — Inactivity re-auth (30-min)
- [Source: CLAUDE.md#Auth] — 30-min inactivity → re-auth, tab close → clear
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#W3] — No inactivity timeout on lab-lite session

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Fixed TypeScript strict mode errors: `useRef` requires explicit `undefined` initial value in React 19 types
- Fixed `focusable[0]`/`focusable[length-1]` possibly undefined — added null guard

### Completion Notes List
- Implemented `useSessionManager` hook with full state machine (active → warning → locked → expired), 1-second tick interval for countdown, absolute session timer via setTimeout, and activity event tracking with 1-second throttle
- Created `SessionWarningToast` with amber color scheme matching StaleDataBanner, fixed bottom-right positioning, role="alert" + aria-live="polite", "Stay signed in" button
- Created `ReAuthModal` with dialog role, aria-modal, focus trap, password verification via callback, error display on failed re-auth, Sign Out button
- Created `SessionManagerProvider` convenience wrapper combining hook + toast + modal
- Exported all new modules, types, and constants (SESSION_DURATIONS, INACTIVITY_TIMEOUT, WARNING_BEFORE_MS) from ui-kit index
- Zero runtime dependencies added — React remains the only peer dep
- All inline styles, no Tailwind — consistent with existing ui-kit patterns
- 33 new tests across 3 test files, all 71 total ui-kit tests pass, build compiles clean

### File List
- `packages/ui-kit/src/useSessionManager.ts` — NEW — Hook with state machine, timers, constants
- `packages/ui-kit/src/SessionWarningToast.tsx` — NEW — Warning toast component
- `packages/ui-kit/src/ReAuthModal.tsx` — NEW — Re-auth modal with password field + focus trap
- `packages/ui-kit/src/SessionManagerProvider.tsx` — NEW — Convenience wrapper
- `packages/ui-kit/src/index.ts` — MODIFIED — Added exports for all new modules
- `packages/ui-kit/src/__tests__/useSessionManager.test.ts` — NEW — 19 hook tests
- `packages/ui-kit/src/__tests__/SessionWarningToast.test.tsx` — NEW — 6 toast tests
- `packages/ui-kit/src/__tests__/ReAuthModal.test.tsx` — NEW — 8 modal tests
