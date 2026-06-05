# Forgot Password — Design Spec

**Date:** 2026-06-05
**Apps:** admin-portal, opd-lite, pharmacy-lite, lab-lite
**Status:** Approved

---

## Overview

Adds a self-service password reset workflow to all four Ultranos PWA apps. All apps share one Supabase project and all use email + password + TOTP MFA. The flow is identical across all four apps.

---

## User Flow

1. Login page → "Forgot password?" link (below password field) → `/forgot-password`
2. `/forgot-password` — user enters email → `supabase.auth.resetPasswordForEmail()` fires → page transitions inline to "check your email" confirmation (no navigation)
3. User clicks link in email → lands on `/reset-password?code=...` → page exchanges code for recovery session → shows new password form with strength bar
4. User sets new password → `supabase.auth.updateUser({ password })` → sign out → redirect to `/login?reset=success`
5. Login page reads `?reset=success` → shows one-time dismissible success banner

---

## Routes

### Spoke apps (opd-lite, pharmacy-lite, lab-lite)

Both routes live inside the existing `(auth)/` route group (passthrough layout, no sidebar):

```
apps/<app>/src/app/[locale]/(auth)/forgot-password/page.tsx
apps/<app>/src/app/[locale]/(auth)/reset-password/page.tsx
```

### Admin Portal

Routes placed at the locale level alongside the existing login page. `AuthGuard.tsx` updated to add both to `PUBLIC_PATHS`:

```
apps/admin-portal/src/app/[locale]/forgot-password/page.tsx
apps/admin-portal/src/app/[locale]/reset-password/page.tsx
```

`PUBLIC_PATHS` in `AuthGuard.tsx` updated from:
```typescript
const PUBLIC_PATHS = ['/', '/login', '/register']
```
to:
```typescript
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password']
```

---

## Page Design

### Visual Style

Both new pages use the **same two-column ShadCN layout as login**:
- `grid min-h-svh lg:grid-cols-2`
- Left: form panel — app icon badge + app name + `LanguageSelectorClient` in header, centered form area, footer
- Right: `bg-primary` panel — identical to the login page for the same app (decorative circles, app icon, tagline, feature bullets)
- Semantic oklch tokens only, no hardcoded hex/oklch values
- RTL-safe logical CSS throughout (`-end-*`, `-start-*`, `text-start`, `ms-auto`)
- App-specific icon (ShieldCheck / Stethoscope / Pill / Microscope) consistent with login

---

### `/forgot-password`

Two inline states — no page navigation between them.

#### Request state (default)

```
[Header: icon badge + "App Name" + LanguageSelectorClient]

[Centered form area]
  h1: "Forgot password"
  p:  "Enter your email and we'll send you a reset link"

  [error alert — shown if Supabase returns an error]

  <form>
    Label + Input (email, type=email, autoComplete=email)
    Button "Send reset link" (full width, disabled while loading)
  </form>

  "Back to sign in" link → /login
```

- If navigated to with `?email=<encoded>`, the email input is pre-filled (login page passes the user's typed email)
- On error (Supabase rate limit, network failure): inline alert, `bg-destructive/10 text-destructive`

#### Success state (after successful submit)

```
[Header: same]

[Centered content]
  MailCheck icon (size-10, text-primary)
  h1: "Check your email"
  p:  "We sent a reset link to your email. It expires in 1 hour."

  "Back to sign in" link → /login
  [after 60s] "Didn't receive it? Resend" link (re-submits email,
              resets 60s timer, stays in success state)
```

- `reportAuthEvent('PASSWORD_RESET_REQUESTED')` emitted on successful submit — **no email in payload** (CLAUDE.md PHI rule)

---

### `/reset-password`

Three inline states — no page navigation.

#### Loading state (on mount)

- Reads `code` query param from URL
- Calls `supabase.auth.exchangeCodeForSession(code)`
- Shows skeleton pulse while exchange is in progress
- If no `code` param in URL: immediately transitions to invalid state

#### Invalid/expired state

```
[Header: same]

[Centered content]
  KeyRound icon (size-10, text-muted-foreground)
  h1: "Link expired"
  p:  "This reset link has expired or is invalid."
  Button "Request a new link" → /forgot-password
```

#### Form state (session established)

```
[Header: same]

[Centered form area]
  h1: "Set new password"
  p:  "Choose a strong password for your account"

  [error alert — shown if updateUser fails]

  <form>
    Label + Input (New password, type=password, autoComplete=new-password)
    <PasswordStrengthBar strength={strength} label={strengthLabel} />

    Label + Input (Confirm password, type=password, autoComplete=new-password)
    [inline error if passwords don't match — shown on blur]

    Button "Update password" (full width, disabled until strength ≥ 2 AND passwords match)
  </form>
```

- `reportAuthEvent('PASSWORD_RESET_COMPLETED', { actorId })` emitted after `updateUser` succeeds
- On success: `supabase.auth.signOut()` then `router.push('/login?reset=success')`
- On error: inline alert

---

### Login page modifications

**"Forgot password?" link** — added between the password field and the submit button:

```
[Password field]
                    Forgot password?   ← text-sm text-muted-foreground text-end
[Sign in button]
```

- Link href: `/forgot-password` (no email param if field is empty)
- Link href: `/forgot-password?email=<encodeURIComponent(email)>` if email field has a value

**Success banner** — rendered above the form when `?reset=success` present in URL:

```
┌─────────────────────────────────────────────────┐
│  Your password has been updated. Please sign in. │  ×
└─────────────────────────────────────────────────┘
```

- Styled: `bg-primary/10 text-primary border border-primary/20 rounded-lg`
- Dismiss (×) calls `router.replace('/login')` to remove the query param
- Purely cosmetic — no auth logic depends on it

---

## PasswordStrengthBar Component (ui-kit)

### Location

```
packages/ui-kit/src/components/PasswordStrengthBar.tsx
packages/ui-kit/src/components/PasswordStrengthBar.test.tsx
```

Exported from `packages/ui-kit/src/index.ts`.

### `getPasswordStrength(password: string): 0 | 1 | 2 | 3 | 4`

One point per criterion:
1. Length ≥ 8
2. Contains uppercase letter
3. Contains a number
4. Contains a symbol (`!@#$%^&*` etc.)

Returns `0` for empty string.

### `PasswordStrengthBar` props

```typescript
interface PasswordStrengthBarProps {
  strength: 0 | 1 | 2 | 3 | 4  // computed by caller
  label: string                  // translated label ("Weak", "Fair", etc.) — i18n-agnostic
}
```

- 4 equal-width segments in a row
- Filled segments use semantic color tokens:
  - 1 segment: `bg-destructive` (Weak)
  - 2 segments: `bg-warning` (Fair) — use `bg-amber-500` if `bg-warning` token absent
  - 3 segments: `bg-info` (Good) — use `bg-blue-500` if `bg-info` token absent
  - 4 segments: `bg-primary` (Strong)
- Unfilled segments: `bg-muted`
- Label text (`text-xs text-muted-foreground`) appears to the right of the bar
- Hidden (`invisible`, preserves layout) when `strength === 0`
- Component is purely presentational — no internal state

### Usage in reset-password page

```typescript
const strength = getPasswordStrength(newPassword)
const strengthLabels = ['', t('auth.passwordStrengthWeak'), t('auth.passwordStrengthFair'), ...]

<PasswordStrengthBar strength={strength} label={strengthLabels[strength]} />
```

The "Update password" button disabled condition (app-level, not in component):
```typescript
disabled={strength < 2 || newPassword !== confirmPassword || loading}
```

---

## Auth Event Types

### Admin Portal (`apps/admin-portal/src/lib/trpc.ts`)

Add to `AdminAuthEventType` union:
```typescript
| 'ADMIN_PASSWORD_RESET_REQUESTED'
| 'ADMIN_PASSWORD_RESET_COMPLETED'
```

### Spoke apps (`apps/*/src/lib/trpc.ts`)

Add to `AuthEventType` union:
```typescript
| 'PASSWORD_RESET_REQUESTED'
| 'PASSWORD_RESET_COMPLETED'
```

**PHI rule:** `PASSWORD_RESET_REQUESTED` must not include `actorEmail`. `PASSWORD_RESET_COMPLETED` may include `actorId` (opaque UUID).

---

## i18n

New keys added under `auth.*` in all 4 × 4 language files (`en.json`, `ar.json`, `prs.json`, `ps.json`):

```json
{
  "auth": {
    "forgotPassword": "Forgot password?",
    "forgotPasswordTitle": "Forgot password",
    "forgotPasswordSubtitle": "Enter your email and we'll send you a reset link",
    "sendResetLink": "Send reset link",
    "checkYourEmail": "Check your email",
    "resetLinkSent": "We sent a reset link to your email. It expires in 1 hour.",
    "didntReceiveIt": "Didn't receive it?",
    "resend": "Resend",
    "resetPasswordTitle": "Set new password",
    "resetPasswordSubtitle": "Choose a strong password for your account",
    "newPassword": "New password",
    "confirmPassword": "Confirm password",
    "updatePassword": "Update password",
    "passwordMismatch": "Passwords do not match",
    "passwordTooShort": "Password must be at least 8 characters",
    "linkExpiredTitle": "Link expired",
    "linkExpiredBody": "This reset link has expired or is invalid.",
    "requestNewLink": "Request a new link",
    "resetSuccess": "Your password has been updated. Please sign in.",
    "backToSignIn": "Back to sign in",
    "passwordStrengthWeak": "Weak",
    "passwordStrengthFair": "Fair",
    "passwordStrengthGood": "Good",
    "passwordStrengthStrong": "Strong"
  }
}
```

- Arabic, Dari, Pashto translations follow the same key structure
- `PasswordStrengthBar` receives the label as a prop — does not call `useTranslations` internally

---

## Supabase Configuration

> **Deployment note — not a code task.**

The `redirectTo` URL in `resetPasswordForEmail()` must be allowlisted in the Supabase dashboard under **Auth → URL Configuration → Redirect URLs**:

```
https://admin.ultranos.com/reset-password
https://<opd-domain>/reset-password
https://<pharmacy-domain>/reset-password
https://<lab-domain>/reset-password
```

Each app passes its own origin at runtime:
```typescript
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`,
})
```

---

## Testing

### `packages/ui-kit/src/components/PasswordStrengthBar.test.tsx`

- `getPasswordStrength('')` → 0
- `getPasswordStrength('abc')` → 0 (length < 8)
- `getPasswordStrength('abcdefgh')` → 1 (length only)
- `getPasswordStrength('Abcdefgh')` → 2 (length + uppercase)
- `getPasswordStrength('Abcdefg1')` → 3 (length + uppercase + number)
- `getPasswordStrength('Abcdefg1!')` → 4 (all criteria)
- Renders 0 filled segments when strength=0, invisible
- Renders correct filled segment count for each score 1–4
- Renders correct label text

### `__tests__/forgot-password.test.tsx` (per app)

- Renders email form with submit button
- Pre-fills email from `?email=` query param
- Submit calls `resetPasswordForEmail` with correct redirectTo
- Transitions to success state on success (form hidden, MailCheck icon shown)
- Success state shows submitted email address
- "Resend" link hidden initially, visible after 60s (fake timers)
- Inline error shown if Supabase returns error
- `PASSWORD_RESET_REQUESTED` emitted — no email in payload
- "Back to sign in" link points to `/login`

### `__tests__/reset-password.test.tsx` (per app)

- Shows loading skeleton on mount
- Shows invalid state when no `code` in URL
- Shows invalid state when `exchangeCodeForSession` fails
- Shows form when `exchangeCodeForSession` succeeds
- `PasswordStrengthBar` receives correct strength as user types
- "Update password" disabled when strength < 2
- "Update password" disabled when passwords don't match
- Inline error shown on blur when passwords don't match
- `updateUser({ password })` called with correct value on submit
- `signOut` called after successful `updateUser`
- Redirects to `/login?reset=success` on success
- Inline error shown if `updateUser` fails
- `PASSWORD_RESET_COMPLETED` emitted with `actorId` on success

### Login page tests (extend existing, per app)

- "Forgot password?" link renders below password field
- Link href is `/forgot-password` when email field empty
- Link href is `/forgot-password?email=<encoded>` when email has value
- Success banner renders when `?reset=success` in URL
- Success banner not rendered without query param
- Dismiss button removes banner and calls `router.replace('/login')`

---

## Complete File List

### `packages/ui-kit/`

| Action | File |
|--------|------|
| Create | `src/components/PasswordStrengthBar.tsx` |
| Create | `src/components/PasswordStrengthBar.test.tsx` |
| Modify | `src/index.ts` — export `PasswordStrengthBar`, `getPasswordStrength` |

### Per app × 4 (admin-portal, opd-lite, pharmacy-lite, lab-lite)

| Action | File |
|--------|------|
| Create | `(auth)/forgot-password/page.tsx` *(spoke)* / `forgot-password/page.tsx` *(admin)* |
| Create | `(auth)/reset-password/page.tsx` *(spoke)* / `reset-password/page.tsx` *(admin)* |
| Create | `__tests__/forgot-password.test.tsx` |
| Create | `__tests__/reset-password.test.tsx` |
| Modify | `src/lib/trpc.ts` — add password reset event types |
| Modify | `messages/en.json`, `ar.json`, `prs.json`, `ps.json` — add auth keys |
| Modify | `login/page.tsx` — "Forgot password?" link + success banner |
| Modify | `__tests__/login*.test.tsx` — extend with new cases |

### Admin-portal only

| Action | File |
|--------|------|
| Modify | `src/components/AuthGuard.tsx` — add `/forgot-password`, `/reset-password` to `PUBLIC_PATHS` |
