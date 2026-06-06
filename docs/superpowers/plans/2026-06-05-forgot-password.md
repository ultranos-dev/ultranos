# Forgot Password — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-service password reset workflow (forgot-password + reset-password pages) to all four Ultranos PWA apps, sharing a `PasswordStrengthBar` component from `packages/ui-kit`.

**Architecture:** Supabase `resetPasswordForEmail` → email link → `exchangeCodeForSession` → `updateUser` → `signOut` → `/login?reset=success`. Two new routes per app, same two-column ShadCN layout as login. Password strength bar is a shared ui-kit presentational component.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Auth, next-intl, @ultranos/ui-kit, Vitest + @testing-library/react

---

## File Map

### packages/ui-kit/
| Action | File |
|--------|------|
| Create | `src/components/PasswordStrengthBar.tsx` |
| Create | `src/components/PasswordStrengthBar.test.tsx` |
| Modify | `src/index.ts` |

### All 4 apps (admin-portal, opd-lite, pharmacy-lite, lab-lite)
| Action | File |
|--------|------|
| Modify | `src/lib/trpc.ts` — add password reset event types |
| Modify | `messages/en.json`, `ar.json`, `prs.json`, `ps.json` — add auth keys |
| Modify | `src/app/[locale]/(auth)/login/page.tsx` or equivalent — "Forgot password?" + success banner |
| Create | `(auth)/forgot-password/page.tsx` *(spoke)* or `forgot-password/page.tsx` *(admin)* |
| Create | `(auth)/reset-password/page.tsx` *(spoke)* or `reset-password/page.tsx` *(admin)* |
| Create | `src/__tests__/forgot-password.test.tsx` |
| Create | `src/__tests__/reset-password.test.tsx` |

### admin-portal only
| Action | File |
|--------|------|
| Modify | `src/components/AuthGuard.tsx` — add `/forgot-password`, `/reset-password` to `PUBLIC_PATHS` |

---

## Task 1: PasswordStrengthBar (packages/ui-kit)

**Files:**
- Create: `packages/ui-kit/src/components/PasswordStrengthBar.tsx`
- Create: `packages/ui-kit/src/components/PasswordStrengthBar.test.tsx`
- Modify: `packages/ui-kit/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/ui-kit/src/components/PasswordStrengthBar.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasswordStrengthBar, getPasswordStrength } from './PasswordStrengthBar'

describe('getPasswordStrength', () => {
  it('returns 0 for empty string', () => {
    expect(getPasswordStrength('')).toBe(0)
  })

  it('returns 0 when length < 8', () => {
    expect(getPasswordStrength('abc')).toBe(0)
  })

  it('returns 1 for length >= 8 only', () => {
    expect(getPasswordStrength('abcdefgh')).toBe(1)
  })

  it('returns 2 for length + uppercase', () => {
    expect(getPasswordStrength('Abcdefgh')).toBe(2)
  })

  it('returns 3 for length + uppercase + number', () => {
    expect(getPasswordStrength('Abcdefg1')).toBe(3)
  })

  it('returns 4 for all criteria (length + upper + number + symbol)', () => {
    expect(getPasswordStrength('Abcdefg1!')).toBe(4)
  })
})

describe('PasswordStrengthBar', () => {
  it('has invisible class when strength is 0', () => {
    const { container } = render(<PasswordStrengthBar strength={0} label="Weak" />)
    expect(container.firstChild).toHaveClass('invisible')
  })

  it('does not have invisible class when strength > 0', () => {
    const { container } = render(<PasswordStrengthBar strength={1} label="Weak" />)
    expect(container.firstChild).not.toHaveClass('invisible')
  })

  it('renders label text when strength > 0', () => {
    render(<PasswordStrengthBar strength={2} label="Fair" />)
    expect(screen.getByText('Fair')).toBeInTheDocument()
  })

  it('renders 4 segment divs', () => {
    const { container } = render(<PasswordStrengthBar strength={3} label="Good" />)
    const segmentContainer = container.querySelector('[data-testid="strength-segments"]')
    expect(segmentContainer?.children).toHaveLength(4)
  })

  it('fills correct number of segments for strength=1 (bg-destructive)', () => {
    const { container } = render(<PasswordStrengthBar strength={1} label="Weak" />)
    const segs = container.querySelectorAll('[data-testid="strength-segment"]')
    const filled = Array.from(segs).filter((el) => el.className.includes('bg-destructive'))
    expect(filled).toHaveLength(1)
  })

  it('fills correct number of segments for strength=2 (bg-amber-500)', () => {
    const { container } = render(<PasswordStrengthBar strength={2} label="Fair" />)
    const segs = container.querySelectorAll('[data-testid="strength-segment"]')
    const filled = Array.from(segs).filter((el) => el.className.includes('bg-amber-500'))
    expect(filled).toHaveLength(2)
  })

  it('fills all 4 segments for strength=4 (bg-primary)', () => {
    const { container } = render(<PasswordStrengthBar strength={4} label="Strong" />)
    const segs = container.querySelectorAll('[data-testid="strength-segment"]')
    const filled = Array.from(segs).filter((el) => el.className.includes('bg-primary'))
    expect(filled).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose PasswordStrengthBar
```

Expected: FAIL — "Cannot find module './PasswordStrengthBar'"

- [ ] **Step 3: Implement the component**

Create `packages/ui-kit/src/components/PasswordStrengthBar.tsx`:

```typescript
/**
 * PasswordStrengthBar — presentational component (no internal state).
 * Exported from @ultranos/ui-kit.
 */

export function getPasswordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password || password.length < 8) return 0
  let score = 1 // length >= 8
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?`~]/.test(password)) score++
  return score as 1 | 2 | 3 | 4
}

export interface PasswordStrengthBarProps {
  /** Score computed by caller via getPasswordStrength() */
  strength: 0 | 1 | 2 | 3 | 4
  /** Translated label e.g. "Weak" — component is i18n-agnostic */
  label: string
}

const SEGMENT_COLOR: Record<number, string> = {
  1: 'bg-destructive',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
  4: 'bg-primary',
}

export function PasswordStrengthBar({ strength, label }: PasswordStrengthBarProps) {
  return (
    <div className={`flex items-center gap-2 ${strength === 0 ? 'invisible' : ''}`}>
      <div className="flex flex-1 gap-1" data-testid="strength-segments">
        {([1, 2, 3, 4] as const).map((seg) => (
          <div
            key={seg}
            data-testid="strength-segment"
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              seg <= strength ? SEGMENT_COLOR[strength] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose PasswordStrengthBar
```

Expected: PASS (all 9 tests)

- [ ] **Step 5: Export from ui-kit index**

In `packages/ui-kit/src/index.ts`, add after the existing DirectionalIcon export line:

```typescript
export { PasswordStrengthBar, getPasswordStrength } from './components/PasswordStrengthBar.js'
export type { PasswordStrengthBarProps } from './components/PasswordStrengthBar.js'
```

- [ ] **Step 6: Rebuild ui-kit**

```bash
pnpm --filter @ultranos/ui-kit build
```

Expected: Build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/components/PasswordStrengthBar.tsx packages/ui-kit/src/components/PasswordStrengthBar.test.tsx packages/ui-kit/src/index.ts packages/ui-kit/dist/
git commit -m "feat(ui-kit): add PasswordStrengthBar component and getPasswordStrength utility"
```

---

## Task 2: Auth Event Types + i18n Keys + admin-portal PUBLIC_PATHS

**Files (per app):**
- Modify: `apps/admin-portal/src/lib/trpc.ts`
- Modify: `apps/opd-lite/src/lib/trpc.ts`
- Modify: `apps/pharmacy-lite/src/lib/trpc.ts`
- Modify: `apps/lab-lite/src/lib/trpc.ts`
- Modify: `apps/*/messages/en.json` (+ ar.json, prs.json, ps.json) — 4 apps × 4 files = 16 files
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx`

### 2a — Auth event types

- [ ] **Step 1: Update spoke app trpc.ts files**

In each of `apps/opd-lite/src/lib/trpc.ts`, `apps/pharmacy-lite/src/lib/trpc.ts`, `apps/lab-lite/src/lib/trpc.ts`:

Find the `AuthEventType` type and extend it:

```typescript
type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_VERIFY_SUCCESS'
  | 'MFA_VERIFY_FAILURE'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
```

- [ ] **Step 2: Update admin-portal trpc.ts**

In `apps/admin-portal/src/lib/trpc.ts`:

Replace `ReportableAuthEventType` and `AdminAuthEventType` and `REPORTABLE_EVENTS`:

```typescript
type ReportableAuthEventType =
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_FAILURE'
  | 'ADMIN_PASSWORD_RESET_REQUESTED'
  | 'ADMIN_PASSWORD_RESET_COMPLETED'

export type AdminAuthEventType =
  | ReportableAuthEventType
  | 'ADMIN_MFA_ENROLLED'
  | 'ADMIN_MFA_UNENROLLED'
  | 'ADMIN_PASSWORD_CHANGED'
  | 'ADMIN_SESSION_REVOKED'

const REPORTABLE_EVENTS = new Set<AdminAuthEventType>([
  'ADMIN_LOGIN_SUCCESS',
  'ADMIN_LOGIN_FAILURE',
  'ADMIN_PASSWORD_RESET_REQUESTED',
  'ADMIN_PASSWORD_RESET_COMPLETED',
])
```

### 2b — i18n keys

- [ ] **Step 3: Add keys to opd-lite messages/en.json**

In `apps/opd-lite/messages/en.json`, under `"auth"`, add the following keys after existing auth keys:

```json
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
"linkExpiredTitle": "Link expired",
"linkExpiredBody": "This reset link has expired or is invalid.",
"requestNewLink": "Request a new link",
"resetSuccess": "Your password has been updated. Please sign in.",
"passwordStrengthWeak": "Weak",
"passwordStrengthFair": "Fair",
"passwordStrengthGood": "Good",
"passwordStrengthStrong": "Strong"
```

Repeat the same additions for `apps/opd-lite/messages/ar.json`, `prs.json`, `ps.json` (use English text as placeholder; translations to be reviewed separately).

- [ ] **Step 4: Add keys to pharmacy-lite messages/en.json**

In `apps/pharmacy-lite/messages/en.json`, under `"auth"`, add the same keys from Step 3 (pharmacy-lite already has `auth.*` keys).

Repeat for `apps/pharmacy-lite/messages/ar.json`, `prs.json`, `ps.json`.

- [ ] **Step 5: Add keys to lab-lite messages/en.json**

In `apps/lab-lite/messages/en.json`, under `"auth"`, add the same keys from Step 3 (lab-lite already has `auth.*` keys).

Repeat for `apps/lab-lite/messages/ar.json`, `prs.json`, `ps.json`.

- [ ] **Step 6: Create auth keys in admin-portal messages/en.json**

`apps/admin-portal/messages/en.json` currently only has `language.*`. Add an `"auth"` section:

```json
{
  "language": {
    "label": "Language",
    "en": "English",
    "ar": "Arabic",
    "prs": "Dari",
    "ps": "Pashto"
  },
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

Repeat for `apps/admin-portal/messages/ar.json`, `prs.json`, `ps.json` (use English as placeholder).

### 2c — admin-portal AuthGuard PUBLIC_PATHS

- [ ] **Step 7: Update AuthGuard.tsx**

In `apps/admin-portal/src/components/AuthGuard.tsx`, find:

```typescript
const PUBLIC_PATHS = ['/', '/login', '/register']
```

Replace with:

```typescript
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password']
```

- [ ] **Step 8: Typecheck and commit**

```bash
pnpm typecheck
```

Expected: No new TypeScript errors.

```bash
git add apps/admin-portal/src/lib/trpc.ts apps/opd-lite/src/lib/trpc.ts apps/pharmacy-lite/src/lib/trpc.ts apps/lab-lite/src/lib/trpc.ts apps/admin-portal/src/components/AuthGuard.tsx apps/*/messages/
git commit -m "feat(auth): add password reset event types, i18n keys, and admin PUBLIC_PATHS"
```

---

## Task 3: Login Page Modifications (All 4 Apps)

Add "Forgot password?" link + success banner to each login page.

**Files:**
- Modify: `apps/admin-portal/src/app/[locale]/login/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx`
- Modify: `apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx`

The changes are identical in structure for all 4 apps. The snippets below use opd-lite as the example; apply the same pattern to all four.

- [ ] **Step 1: Add imports to opd-lite login page**

In `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx`, add these imports at the top:

```typescript
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
```

- [ ] **Step 2: Add state + hooks inside the component**

Inside `export default function LoginPage()`, add after `const [loading, setLoading] = useState(false)`:

```typescript
const t = useTranslations('auth')
const searchParams = useSearchParams()
const router = useRouter()
const resetSuccess = searchParams.get('reset') === 'success'
const [showResetBanner, setShowResetBanner] = useState(resetSuccess)
```

- [ ] **Step 3: Add success banner — rendered above the form area**

Inside the `<div className="w-full max-w-sm space-y-6">` block, add as the first child (before `<div>` heading block):

```tsx
{showResetBanner && (
  <div
    role="status"
    className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary"
  >
    <span>{t('resetSuccess')}</span>
    <button
      type="button"
      aria-label="Dismiss"
      onClick={() => {
        setShowResetBanner(false)
        router.replace('/login')
      }}
      className="ms-2 text-primary hover:text-primary/80"
    >
      ×
    </button>
  </div>
)}
```

- [ ] **Step 4: Add "Forgot password?" link to credentials form**

Inside the credentials form (`{step === 'credentials' && (<form ...>`)`, between the password `<div className="space-y-2">` block and the submit `<Button>`, add:

```tsx
<div className="flex justify-end">
  <Link
    href={
      email
        ? `/forgot-password?email=${encodeURIComponent(email)}`
        : '/forgot-password'
    }
    className="text-sm text-muted-foreground hover:text-foreground"
  >
    {t('forgotPassword')}
  </Link>
</div>
```

- [ ] **Step 5: Apply same changes to admin-portal login page**

`apps/admin-portal/src/app/[locale]/login/page.tsx` — same 4 modifications as above:

1. Add imports: `useSearchParams`, `useRouter`, `useTranslations`, `Link`
2. Add `const t = useTranslations('auth')`, `searchParams`, `router`, `resetSuccess`, `showResetBanner` state
3. Add success banner (same JSX)
4. Add "Forgot password?" link in the credentials form (same JSX) — between the password div and the submit Button

- [ ] **Step 6: Apply same changes to pharmacy-lite login page**

`apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx` — same 4 modifications.

Note: pharmacy-lite already imports `useTranslations` and has `const t = useTranslations('login')`. Add a second translation hook:

```typescript
const tAuth = useTranslations('auth')
```

Then use `tAuth('forgotPassword')` and `tAuth('resetSuccess')` in the new JSX (the existing `t` keeps serving `login.*` keys for the existing footer).

- [ ] **Step 7: Apply same changes to lab-lite login page**

`apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx` — same 4 modifications.

Note: lab-lite uses a custom `Button` component with `variant="primary" fullWidth` props. The "Forgot password?" link is a plain `<Link>` and needs no Button changes.

- [ ] **Step 8: Typecheck all apps**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add apps/admin-portal/src/app apps/opd-lite/src/app apps/pharmacy-lite/src/app apps/lab-lite/src/app
git commit -m "feat(auth): add forgot password link and reset success banner to login pages"
```

---

## Task 4: admin-portal Forgot/Reset Password Pages + Tests

**Files:**
- Create: `apps/admin-portal/src/app/[locale]/forgot-password/page.tsx`
- Create: `apps/admin-portal/src/app/[locale]/reset-password/page.tsx`
- Create: `apps/admin-portal/src/__tests__/forgot-password.test.tsx`
- Create: `apps/admin-portal/src/__tests__/reset-password.test.tsx`

### 4a — Tests first

- [ ] **Step 1: Write forgot-password tests**

Create `apps/admin-portal/src/__tests__/forgot-password.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockResetPasswordForEmail = vi.fn()
const mockReportAdminAuthEvent = vi.fn()
const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAdminAuthEvent: mockReportAdminAuthEvent,
}))

let mockSearchParamsValue = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

import ForgotPasswordPage from '../app/[locale]/forgot-password/page'

describe('ForgotPasswordPage (admin-portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsValue = ''
  })

  it('renders email form with submit button', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sendResetLink/i })).toBeInTheDocument()
  })

  it('pre-fills email from ?email= query param', () => {
    mockSearchParamsValue = 'email=admin%40hospital.example'
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('admin@hospital.example')
  })

  it('calls resetPasswordForEmail with correct redirectTo on submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('admin@hospital.example', {
        redirectTo: expect.stringContaining('/reset-password'),
      })
    })
  })

  it('transitions to success state on successful submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByText('checkYourEmail')).toBeInTheDocument()
    })
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('emits ADMIN_PASSWORD_RESET_REQUESTED with no email in payload', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAdminAuthEvent).toHaveBeenCalledWith('ADMIN_PASSWORD_RESET_REQUESTED')
    })
    const callArgs = mockReportAdminAuthEvent.mock.calls[0]
    // PHI rule: no second argument, no actorEmail
    expect(callArgs[1]).toBeUndefined()
  })

  it('shows inline error when Supabase returns error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Rate limit exceeded' } })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Rate limit exceeded')
    })
  })

  it('"Resend" link is hidden initially and visible after 60s', async () => {
    vi.useFakeTimers()
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => screen.getByText('checkYourEmail'))
    expect(screen.queryByText('resend')).not.toBeInTheDocument()

    vi.advanceTimersByTime(60_000)
    await waitFor(() => {
      expect(screen.getByText('resend')).toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('"Back to sign in" link points to /login', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('link', { name: /backToSignIn/i })).toHaveAttribute('href', '/login')
  })
})
```

- [ ] **Step 2: Write reset-password tests**

Create `apps/admin-portal/src/__tests__/reset-password.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockExchangeCodeForSession = vi.fn()
const mockUpdateUser = vi.fn()
const mockSignOut = vi.fn()
const mockReportAdminAuthEvent = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAdminAuthEvent: mockReportAdminAuthEvent,
}))

let mockSearchParamsValue = 'code=abc123'
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@ultranos/ui-kit', () => ({
  PasswordStrengthBar: ({ label }: { label: string }) => <div data-testid="strength-bar">{label}</div>,
  getPasswordStrength: (p: string) => (p.length >= 8 ? 2 : 0) as 0 | 1 | 2 | 3 | 4,
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ clearSession: vi.fn() }) },
}))

import ResetPasswordPage from '../app/[locale]/reset-password/page'

describe('ResetPasswordPage (admin-portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsValue = 'code=abc123'
  })

  it('shows loading skeleton on mount before exchange resolves', () => {
    mockExchangeCodeForSession.mockReturnValue(new Promise(() => {}))
    render(<ResetPasswordPage />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('shows invalid state when no code in URL', async () => {
    mockSearchParamsValue = ''
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('linkExpiredTitle')).toBeInTheDocument()
    })
  })

  it('shows invalid state when exchangeCodeForSession fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'Expired' } })
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('linkExpiredTitle')).toBeInTheDocument()
    })
  })

  it('shows form when exchangeCodeForSession succeeds', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('resetPasswordTitle')).toBeInTheDocument()
    })
  })

  it('"Update password" button is disabled when strength < 2', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'abc')
    expect(screen.getByRole('button', { name: /updatePassword/i })).toBeDisabled()
  })

  it('"Update password" button is disabled when passwords do not match', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Different1!')
    expect(screen.getByRole('button', { name: /updatePassword/i })).toBeDisabled()
  })

  it('shows mismatch error on blur when passwords differ', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    const confirmInput = screen.getByLabelText('confirmPassword')
    await userEvent.type(confirmInput, 'Different1!')
    fireEvent.blur(confirmInput)

    expect(screen.getByText('passwordMismatch')).toBeInTheDocument()
  })

  it('calls updateUser with correct password and redirects on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Abcdefg1!' })
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/login?reset=success')
    })
  })

  it('emits ADMIN_PASSWORD_RESET_COMPLETED with actorId on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-uuid-42' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAdminAuthEvent).toHaveBeenCalledWith(
        'ADMIN_PASSWORD_RESET_COMPLETED',
        { actorId: 'admin-uuid-42' },
      )
    })
  })

  it('shows inline error when updateUser fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: { message: 'Password too weak' } })

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Password too weak')
    })
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter admin-portal test -- --reporter=verbose forgot-password reset-password
```

Expected: FAIL — module not found.

### 4b — Implement the pages

- [ ] **Step 4: Create forgot-password page**

Create `apps/admin-portal/src/app/[locale]/forgot-password/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ShieldCheck, MailCheck } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

type ForgotState = 'request' | 'sent'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const [state, setState] = useState<ForgotState>('request')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        setError(resetError.message)
        return
      }

      // PHI rule: no actorEmail in payload
      reportAdminAuthEvent('ADMIN_PASSWORD_RESET_REQUESTED')
      setState('sent')
      setResendCooldown(true)
      setTimeout(() => setResendCooldown(false), 60_000)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setLoading(true)
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setResendCooldown(true)
      setTimeout(() => setResendCooldown(false), 60_000)
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">Admin Portal</span>
          </div>
          <LanguageSelectorClient />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            {state === 'request' ? (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('forgotPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('forgotPasswordSubtitle')}</p>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending…' : t('sendResetLink')}
                  </Button>
                </form>

                <p className="text-center text-sm">
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    {t('backToSignIn')}
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-4 text-center">
                  <MailCheck className="size-10 text-primary" />
                  <div>
                    <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                      {t('checkYourEmail')}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t('resetLinkSent')}</p>
                  </div>
                </div>

                <p className="text-center text-sm">
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    {t('backToSignIn')}
                  </Link>
                </p>

                {!resendCooldown && (
                  <p className="text-center text-sm text-muted-foreground">
                    {t('didntReceiveIt')}{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {t('resend')}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Ultranos Healthcare Platform</p>
      </div>

      {/* ── Right: brand panel ── */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <ShieldCheck className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">Admin Portal</h2>
          <p className="mt-3 text-base text-primary-foreground/75">
            Secure operations management for clinical facilities
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Organization & user management',
              'Module provisioning & billing',
              'Audit logs & compliance reporting',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create reset-password page**

Create `apps/admin-portal/src/app/[locale]/reset-password/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ShieldCheck, KeyRound } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { PasswordStrengthBar, getPasswordStrength } from '@ultranos/ui-kit'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type ResetState = 'loading' | 'invalid' | 'form'

export default function ResetPasswordPage() {
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<ResetState>('loading')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [actorId, setActorId] = useState<string | undefined>()

  const supabase = getSupabaseBrowserClient()
  const strength = getPasswordStrength(newPassword)
  const strengthLabels = [
    '',
    t('passwordStrengthWeak'),
    t('passwordStrengthFair'),
    t('passwordStrengthGood'),
    t('passwordStrengthStrong'),
  ]

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setState('invalid')
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchErr }) => {
      if (exchErr || !data.session) {
        setState('invalid')
        return
      }
      setActorId(data.session.user.id)
      setState('form')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (strength < 2 || newPassword !== confirmPassword) return

    setError(null)
    setLoading(true)

    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })

      if (updateErr) {
        setError(updateErr.message)
        return
      }

      reportAdminAuthEvent('ADMIN_PASSWORD_RESET_COMPLETED', { actorId })
      useAuthSessionStore.getState().clearSession()
      await supabase.auth.signOut()
      router.push('/login?reset=success')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">Admin Portal</span>
          </div>
          <LanguageSelectorClient />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            {state === 'loading' && (
              <div className="space-y-4" aria-busy="true" aria-label="Loading">
                <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-64 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            )}

            {state === 'invalid' && (
              <div className="flex flex-col items-center gap-4 text-center">
                <KeyRound className="size-10 text-muted-foreground" />
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('linkExpiredTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('linkExpiredBody')}</p>
                </div>
                <Link href="/forgot-password" className="w-full">
                  <Button className="w-full">{t('requestNewLink')}</Button>
                </Link>
              </div>
            )}

            {state === 'form' && (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('resetPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('resetPasswordSubtitle')}</p>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t('newPassword')}</Label>
                    <Input
                      id="new-password"
                      aria-label={t('newPassword')}
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <PasswordStrengthBar strength={strength} label={strengthLabels[strength]} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
                    <Input
                      id="confirm-password"
                      aria-label={t('confirmPassword')}
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmTouched(true)}
                      autoComplete="new-password"
                    />
                    {confirmTouched && confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">{t('passwordMismatch')}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={strength < 2 || newPassword !== confirmPassword || loading}
                  >
                    {loading ? 'Updating…' : t('updatePassword')}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Ultranos Healthcare Platform</p>
      </div>

      {/* ── Right: brand panel ── */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <ShieldCheck className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">Admin Portal</h2>
          <p className="mt-3 text-base text-primary-foreground/75">
            Secure operations management for clinical facilities
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Organization & user management',
              'Module provisioning & billing',
              'Audit logs & compliance reporting',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter admin-portal test -- --reporter=verbose forgot-password reset-password
```

Expected: PASS (all tests).

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter admin-portal typecheck
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/admin-portal/src/app/[locale]/forgot-password apps/admin-portal/src/app/[locale]/reset-password apps/admin-portal/src/__tests__/forgot-password.test.tsx apps/admin-portal/src/__tests__/reset-password.test.tsx
git commit -m "feat(admin-portal): add forgot-password and reset-password pages"
```

---

## Task 5: opd-lite Forgot/Reset Password Pages + Tests

**Files:**
- Create: `apps/opd-lite/src/app/[locale]/(auth)/forgot-password/page.tsx`
- Create: `apps/opd-lite/src/app/[locale]/(auth)/reset-password/page.tsx`
- Create: `apps/opd-lite/src/__tests__/forgot-password.test.tsx`
- Create: `apps/opd-lite/src/__tests__/reset-password.test.tsx`

### 5a — Tests first

- [ ] **Step 1: Write forgot-password tests**

Create `apps/opd-lite/src/__tests__/forgot-password.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockResetPasswordForEmail = vi.fn()
const mockReportAuthEvent = vi.fn()
const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAuthEvent: mockReportAuthEvent,
}))

let mockSearchParamsValue = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

import ForgotPasswordPage from '../app/[locale]/(auth)/forgot-password/page'

describe('ForgotPasswordPage (opd-lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsValue = ''
  })

  it('renders email form with submit button', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sendResetLink/i })).toBeInTheDocument()
  })

  it('pre-fills email from ?email= query param', () => {
    mockSearchParamsValue = 'email=doctor%40hospital.example'
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('doctor@hospital.example')
  })

  it('calls resetPasswordForEmail with correct redirectTo on submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'doctor@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('doctor@hospital.example', {
        redirectTo: expect.stringContaining('/reset-password'),
      })
    })
  })

  it('transitions to success state on successful submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'doctor@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByText('checkYourEmail')).toBeInTheDocument()
    })
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('emits PASSWORD_RESET_REQUESTED with no email in payload', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'doctor@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAuthEvent).toHaveBeenCalledWith('PASSWORD_RESET_REQUESTED')
    })
    const callArgs = mockReportAuthEvent.mock.calls[0]
    expect(callArgs[1]).toBeUndefined()
  })

  it('shows inline error when Supabase returns error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Too many requests' } })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'doctor@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too many requests')
    })
  })

  it('"Resend" link hidden initially, visible after 60s', async () => {
    vi.useFakeTimers()
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'doctor@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => screen.getByText('checkYourEmail'))
    expect(screen.queryByText('resend')).not.toBeInTheDocument()

    vi.advanceTimersByTime(60_000)
    await waitFor(() => {
      expect(screen.getByText('resend')).toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('"Back to sign in" link points to /login', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('link', { name: /backToSignIn/i })).toHaveAttribute('href', '/login')
  })
})
```

- [ ] **Step 2: Write reset-password tests**

Create `apps/opd-lite/src/__tests__/reset-password.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockExchangeCodeForSession = vi.fn()
const mockUpdateUser = vi.fn()
const mockSignOut = vi.fn()
const mockReportAuthEvent = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAuthEvent: mockReportAuthEvent,
}))

let mockSearchParamsValue = 'code=abc123'
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@ultranos/ui-kit', () => ({
  PasswordStrengthBar: ({ label }: { label: string }) => <div data-testid="strength-bar">{label}</div>,
  getPasswordStrength: (p: string) => (p.length >= 8 ? 2 : 0) as 0 | 1 | 2 | 3 | 4,
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ clearSession: vi.fn() }) },
}))

import ResetPasswordPage from '../app/[locale]/(auth)/reset-password/page'

describe('ResetPasswordPage (opd-lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsValue = 'code=abc123'
  })

  it('shows loading skeleton on mount', () => {
    mockExchangeCodeForSession.mockReturnValue(new Promise(() => {}))
    render(<ResetPasswordPage />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('shows invalid state when no code in URL', async () => {
    mockSearchParamsValue = ''
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('linkExpiredTitle')).toBeInTheDocument()
    })
  })

  it('shows invalid state when exchangeCodeForSession fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'Expired' } })
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('linkExpiredTitle')).toBeInTheDocument()
    })
  })

  it('shows form when exchangeCodeForSession succeeds', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('resetPasswordTitle')).toBeInTheDocument()
    })
  })

  it('"Update password" disabled when strength < 2', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'abc')
    expect(screen.getByRole('button', { name: /updatePassword/i })).toBeDisabled()
  })

  it('"Update password" disabled when passwords do not match', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Different1!')
    expect(screen.getByRole('button', { name: /updatePassword/i })).toBeDisabled()
  })

  it('calls updateUser, signOut, and redirects on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-opd-1' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Abcdefg1!' })
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/login?reset=success')
    })
  })

  it('emits PASSWORD_RESET_COMPLETED with actorId', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'opd-uuid-99' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAuthEvent).toHaveBeenCalledWith(
        'PASSWORD_RESET_COMPLETED',
        { actorId: 'opd-uuid-99' },
      )
    })
  })

  it('shows inline error when updateUser fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: { message: 'Too short' } })

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Too short')
    })
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter opd-lite test -- --reporter=verbose forgot-password reset-password
```

Expected: FAIL — module not found.

### 5b — Implement the pages

- [ ] **Step 4: Create forgot-password page**

Create `apps/opd-lite/src/app/[locale]/(auth)/forgot-password/page.tsx`:

Use the same structure as admin-portal's forgot-password page (Task 4, Step 4), with these differences:
- Icon: `Stethoscope` (from `@ultranos/ui-kit/icons`) instead of `ShieldCheck`
- App name: `"OPD Lite"` instead of `"Admin Portal"`
- Button import: `import { Button } from '@ultranos/ui-kit/components/ui/button'` instead of `@/components/ui/button`
- Input/Label imports: `from '@ultranos/ui-kit/components/ui/input'` and `from '@ultranos/ui-kit/components/ui/label'`
- Auth event: `reportAuthEvent('PASSWORD_RESET_REQUESTED')` (from `@/lib/trpc`)
- Brand panel right side: same as opd-lite login page (Stethoscope, "OPD Lite", "Clinical workflows for outpatient care", same feature bullets)

Full file:

```typescript
'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Stethoscope, MailCheck } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

type ForgotState = 'request' | 'sent'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const [state, setState] = useState<ForgotState>('request')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        setError(resetError.message)
        return
      }

      reportAuthEvent('PASSWORD_RESET_REQUESTED')
      setState('sent')
      setResendCooldown(true)
      setTimeout(() => setResendCooldown(false), 60_000)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setLoading(true)
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setResendCooldown(true)
      setTimeout(() => setResendCooldown(false), 60_000)
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">OPD Lite</span>
          </div>
          <LanguageSelectorClient />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            {state === 'request' ? (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('forgotPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('forgotPasswordSubtitle')}</p>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending…' : t('sendResetLink')}
                  </Button>
                </form>

                <p className="text-center text-sm">
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    {t('backToSignIn')}
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-4 text-center">
                  <MailCheck className="size-10 text-primary" />
                  <div>
                    <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                      {t('checkYourEmail')}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">{t('resetLinkSent')}</p>
                  </div>
                </div>

                <p className="text-center text-sm">
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">
                    {t('backToSignIn')}
                  </Link>
                </p>

                {!resendCooldown && (
                  <p className="text-center text-sm text-muted-foreground">
                    {t('didntReceiveIt')}{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {t('resend')}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Ultranos Healthcare Platform</p>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Stethoscope className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">OPD Lite</h2>
          <p className="mt-3 text-base text-primary-foreground/75">Clinical workflows for outpatient care</p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Patient registration & encounters',
              'Offline-first clinical documentation',
              'Prescription management',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create reset-password page**

Create `apps/opd-lite/src/app/[locale]/(auth)/reset-password/page.tsx`:

Use the same structure as admin-portal's reset-password page (Task 4, Step 5), with these differences:
- Icon: `Stethoscope` instead of `ShieldCheck`
- App name: `"OPD Lite"` instead of `"Admin Portal"`
- Button/Input/Label imports: from `@ultranos/ui-kit/components/ui/...` instead of `@/components/ui/...`
- Auth event: `reportAuthEvent('PASSWORD_RESET_COMPLETED', { actorId })` (from `@/lib/trpc`)
- Brand panel: same as OPD Lite (Stethoscope, feature bullets)

Full file:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Stethoscope, KeyRound } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { PasswordStrengthBar, getPasswordStrength } from '@ultranos/ui-kit'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type ResetState = 'loading' | 'invalid' | 'form'

export default function ResetPasswordPage() {
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<ResetState>('loading')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [actorId, setActorId] = useState<string | undefined>()

  const supabase = getSupabaseBrowserClient()
  const strength = getPasswordStrength(newPassword)
  const strengthLabels = [
    '',
    t('passwordStrengthWeak'),
    t('passwordStrengthFair'),
    t('passwordStrengthGood'),
    t('passwordStrengthStrong'),
  ]

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setState('invalid')
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchErr }) => {
      if (exchErr || !data.session) {
        setState('invalid')
        return
      }
      setActorId(data.session.user.id)
      setState('form')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (strength < 2 || newPassword !== confirmPassword) return

    setError(null)
    setLoading(true)

    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) {
        setError(updateErr.message)
        return
      }
      reportAuthEvent('PASSWORD_RESET_COMPLETED', { actorId })
      useAuthSessionStore.getState().clearSession()
      await supabase.auth.signOut()
      router.push('/login?reset=success')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">OPD Lite</span>
          </div>
          <LanguageSelectorClient />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            {state === 'loading' && (
              <div className="space-y-4" aria-busy="true" aria-label="Loading">
                <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-64 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            )}

            {state === 'invalid' && (
              <div className="flex flex-col items-center gap-4 text-center">
                <KeyRound className="size-10 text-muted-foreground" />
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('linkExpiredTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('linkExpiredBody')}</p>
                </div>
                <Link href="/forgot-password" className="w-full">
                  <Button className="w-full">{t('requestNewLink')}</Button>
                </Link>
              </div>
            )}

            {state === 'form' && (
              <>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    {t('resetPasswordTitle')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t('resetPasswordSubtitle')}</p>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form role="form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t('newPassword')}</Label>
                    <Input
                      id="new-password"
                      aria-label={t('newPassword')}
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <PasswordStrengthBar strength={strength} label={strengthLabels[strength]} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
                    <Input
                      id="confirm-password"
                      aria-label={t('confirmPassword')}
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmTouched(true)}
                      autoComplete="new-password"
                    />
                    {confirmTouched && confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">{t('passwordMismatch')}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={strength < 2 || newPassword !== confirmPassword || loading}
                  >
                    {loading ? 'Updating…' : t('updatePassword')}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">Ultranos Healthcare Platform</p>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Stethoscope className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">OPD Lite</h2>
          <p className="mt-3 text-base text-primary-foreground/75">Clinical workflows for outpatient care</p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Patient registration & encounters',
              'Offline-first clinical documentation',
              'Prescription management',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground/50" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm --filter opd-lite test -- --reporter=verbose forgot-password reset-password
pnpm --filter opd-lite typecheck
```

Expected: All tests PASS, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/opd-lite/src/app/[locale]/\(auth\)/forgot-password apps/opd-lite/src/app/[locale]/\(auth\)/reset-password apps/opd-lite/src/__tests__/forgot-password.test.tsx apps/opd-lite/src/__tests__/reset-password.test.tsx
git commit -m "feat(opd-lite): add forgot-password and reset-password pages"
```

---

## Task 6: pharmacy-lite Forgot/Reset Password Pages + Tests

**Files:**
- Create: `apps/pharmacy-lite/src/app/[locale]/(auth)/forgot-password/page.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(auth)/reset-password/page.tsx`
- Create: `apps/pharmacy-lite/src/__tests__/forgot-password.test.tsx`
- Create: `apps/pharmacy-lite/src/__tests__/reset-password.test.tsx`

### 6a — Tests first

- [ ] **Step 1: Write forgot-password tests**

Create `apps/pharmacy-lite/src/__tests__/forgot-password.test.tsx`:

Same content as `apps/opd-lite/src/__tests__/forgot-password.test.tsx` (Task 5, Step 1), with these changes:
- Import path: `'../app/[locale]/(auth)/forgot-password/page'`
- Test `describe` label: `'ForgotPasswordPage (pharmacy-lite)'`

- [ ] **Step 2: Write reset-password tests**

Create `apps/pharmacy-lite/src/__tests__/reset-password.test.tsx`:

Same content as `apps/opd-lite/src/__tests__/reset-password.test.tsx` (Task 5, Step 2), with these changes:
- Import path: `'../app/[locale]/(auth)/reset-password/page'`
- Test `describe` label: `'ResetPasswordPage (pharmacy-lite)'`

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter pharmacy-lite test -- --reporter=verbose forgot-password reset-password
```

Expected: FAIL — module not found.

### 6b — Implement the pages

- [ ] **Step 4: Create forgot-password page**

Create `apps/pharmacy-lite/src/app/[locale]/(auth)/forgot-password/page.tsx`:

Same structure as opd-lite's forgot-password page (Task 5, Step 4), with these differences:
- Icon: `Pill` (from `@ultranos/ui-kit/icons`) instead of `Stethoscope`
- App name: `"Pharmacy Lite"` instead of `"OPD Lite"`
- Button import: `import { Button } from '@/components/ui/button'` (pharmacy-lite uses local proxy)
- Input/Label imports: `from '@/components/ui/input'` and `from '@/components/ui/label'`
- Brand panel: `Pill` icon, `"Pharmacy Lite"`, `"Medication management and dispensing"`, bullets: `['Digital prescription verification', 'Drug interaction checking', 'Inventory & stock management']`
- Footer: `"Secure healthcare platform"` (hardcoded)

- [ ] **Step 5: Create reset-password page**

Create `apps/pharmacy-lite/src/app/[locale]/(auth)/reset-password/page.tsx`:

Same structure as opd-lite's reset-password page (Task 5, Step 5), with these differences:
- Icon: `Pill` instead of `Stethoscope`
- App name: `"Pharmacy Lite"` instead of `"OPD Lite"`
- Button/Input/Label imports: `from '@/components/ui/...'`
- Brand panel: same as pharmacy-lite login (Pill, feature bullets)
- Footer: `"Secure healthcare platform"` (hardcoded)

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm --filter pharmacy-lite test -- --reporter=verbose forgot-password reset-password
pnpm --filter pharmacy-lite typecheck
```

Expected: All tests PASS, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmacy-lite/src/app/[locale]/\(auth\)/forgot-password apps/pharmacy-lite/src/app/[locale]/\(auth\)/reset-password apps/pharmacy-lite/src/__tests__/forgot-password.test.tsx apps/pharmacy-lite/src/__tests__/reset-password.test.tsx
git commit -m "feat(pharmacy-lite): add forgot-password and reset-password pages"
```

---

## Task 7: lab-lite Forgot/Reset Password Pages + Tests

**Files:**
- Create: `apps/lab-lite/src/app/[locale]/(auth)/forgot-password/page.tsx`
- Create: `apps/lab-lite/src/app/[locale]/(auth)/reset-password/page.tsx`
- Create: `apps/lab-lite/src/__tests__/forgot-password.test.tsx`
- Create: `apps/lab-lite/src/__tests__/reset-password.test.tsx`

### 7a — Tests first

- [ ] **Step 1: Write forgot-password tests**

Create `apps/lab-lite/src/__tests__/forgot-password.test.tsx`:

Same content as `apps/opd-lite/src/__tests__/forgot-password.test.tsx` (Task 5, Step 1), with:
- Import path: `'../app/[locale]/(auth)/forgot-password/page'`
- Test `describe` label: `'ForgotPasswordPage (lab-lite)'`

- [ ] **Step 2: Write reset-password tests**

Create `apps/lab-lite/src/__tests__/reset-password.test.tsx`:

Same content as opd-lite's reset-password test (Task 5, Step 2), with:
- Import path: `'../app/[locale]/(auth)/reset-password/page'`
- Test `describe` label: `'ResetPasswordPage (lab-lite)'`
- The `@ultranos/ui-kit` mock is the same
- The `@/stores/auth-session-store` mock changes: lab-lite has `clearSession` but also resets `labRole` from localStorage. Mock:

```typescript
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ clearSession: vi.fn(), session: null }) },
}))
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm --filter lab-lite test -- --reporter=verbose forgot-password reset-password
```

Expected: FAIL — module not found.

### 7b — Implement the pages

- [ ] **Step 4: Create forgot-password page**

Create `apps/lab-lite/src/app/[locale]/(auth)/forgot-password/page.tsx`:

Same structure as opd-lite's forgot-password page (Task 5, Step 4), with these differences:
- Icon: `Microscope` (from `@ultranos/ui-kit/icons`) instead of `Stethoscope`
- App name: `"Lab Lite"` instead of `"OPD Lite"`
- Button import: `import { Button } from '@/components/ui/Button'` — lab-lite has a custom Button component with different props
- Submit button: use `<Button variant="primary" type="submit" fullWidth disabled={loading}>` instead of `<Button type="submit" className="w-full" disabled={loading}>`
- Input/Label imports: `from '@/components/ui/input'` and `from '@/components/ui/label'`
- Brand panel: `Microscope` icon, `"Lab Lite"`, `"Diagnostic result entry and quality control"`, bullets: `['Barcode scan & result entry', 'Quality control charts', 'AI-assisted result validation']`
- Footer: `"Secure clinical laboratory diagnostics platform"` (hardcoded)

- [ ] **Step 5: Create reset-password page**

Create `apps/lab-lite/src/app/[locale]/(auth)/reset-password/page.tsx`:

Same structure as opd-lite's reset-password page (Task 5, Step 5), with these differences:
- Icon: `Microscope` instead of `Stethoscope`
- App name: `"Lab Lite"` instead of `"OPD Lite"`
- Button import: `from '@/components/ui/Button'` (custom lab-lite Button)
- Submit button uses `variant="primary" fullWidth` props pattern:

```tsx
<Button
  variant="primary"
  type="submit"
  fullWidth
  disabled={strength < 2 || newPassword !== confirmPassword || loading}
>
  {loading ? 'Updating…' : t('updatePassword')}
</Button>
```

- "Request a new link" button in invalid state also uses `variant="primary" fullWidth`:

```tsx
<Button variant="primary" type="button" fullWidth onClick={() => { window.location.href = '/forgot-password' }}>
  {t('requestNewLink')}
</Button>
```

- Brand panel: same as lab-lite login (Microscope, feature bullets)
- Footer: `"Secure clinical laboratory diagnostics platform"`

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm --filter lab-lite test -- --reporter=verbose forgot-password reset-password
pnpm --filter lab-lite typecheck
```

Expected: All tests PASS, no TypeScript errors.

- [ ] **Step 7: Final typecheck across monorepo**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/lab-lite/src/app/[locale]/\(auth\)/forgot-password apps/lab-lite/src/app/[locale]/\(auth\)/reset-password apps/lab-lite/src/__tests__/forgot-password.test.tsx apps/lab-lite/src/__tests__/reset-password.test.tsx
git commit -m "feat(lab-lite): add forgot-password and reset-password pages"
```

---

## Spec Coverage Check

| Spec Requirement | Covered By |
|-----------------|------------|
| `/forgot-password` route per app | Tasks 4–7 |
| `/reset-password` route per app | Tasks 4–7 |
| Inline state transitions (no navigation) | Tasks 4–7 (ForgotState/ResetState enum) |
| PasswordStrengthBar (4-segment, shared) | Task 1 |
| `getPasswordStrength` utility | Task 1 |
| Strength ≥ 2 gate on submit | Tasks 4–7 reset page |
| `exchangeCodeForSession(code)` | Tasks 4–7 reset page |
| Loading skeleton during code exchange | Tasks 4–7 reset page |
| Invalid/expired state (no code or failed exchange) | Tasks 4–7 reset page |
| `updateUser({ password })` | Tasks 4–7 reset page |
| `signOut()` after success | Tasks 4–7 reset page |
| Redirect to `/login?reset=success` | Tasks 4–7 reset page |
| Success banner on login page | Task 3 |
| "Forgot password?" link on login page | Task 3 |
| Link passes email if field has value | Task 3 |
| `PASSWORD_RESET_REQUESTED` — no email in payload | Tasks 4–7 |
| `PASSWORD_RESET_COMPLETED` with actorId | Tasks 4–7 |
| Admin uses `ADMIN_PASSWORD_RESET_*` events | Task 2 + Task 4 |
| admin-portal `PUBLIC_PATHS` update | Task 2 |
| i18n keys in all 4 apps × 4 locales | Task 2 |
| Two-column ShadCN layout on new pages | Tasks 4–7 |
| RTL-safe logical CSS (`-end-*`, `-start-*`) | All pages use existing login page RTL classes |
| `redirectTo: window.location.origin/reset-password` | Tasks 4–7 forgot page |
| Resend after 60s cooldown | Tasks 4–7 forgot page |
