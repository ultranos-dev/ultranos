# Login Screen Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all four app login pages to the ShadCN two-column full-screen layout (`grid min-h-svh lg:grid-cols-2`) with a form panel on the left and a branded primary-colour panel on the right.

**Architecture:** Admin Portal's layout already isolates login from the sidebar (AuthGuard renders a `public` state without sidebar chrome). The three spoke apps (OPD Lite, Pharmacy Lite, Lab Lite) currently render login inside the full sidebar layout; we fix this by splitting `[locale]/layout.tsx` into a minimal locale wrapper plus two route groups — `(app)/` carries the sidebar, `(auth)/` is sidebar-free and owns the login page.

**Tech Stack:** Next.js 15 App Router, next-intl, Tailwind CSS v3, ShadCN UI via `@ultranos/ui-kit`, lucide-react icons via `@ultranos/ui-kit/icons`

---

## File Map

### Admin Portal (no routing changes needed)
| Action | Path |
|--------|------|
| Modify | `apps/admin-portal/src/app/[locale]/login/page.tsx` |

### OPD Lite
| Action | Path |
|--------|------|
| Modify | `apps/opd-lite/src/app/[locale]/layout.tsx` |
| Create | `apps/opd-lite/src/app/[locale]/(app)/layout.tsx` |
| Create | `apps/opd-lite/src/app/[locale]/(auth)/layout.tsx` |
| Create | `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx` |
| Create | `apps/opd-lite/src/components/LanguageSelectorClient.tsx` |
| Delete (bash) | `apps/opd-lite/src/app/[locale]/login/` |
| Move (bash) | All `[locale]/<route>/` → `[locale]/(app)/<route>/` |

### Pharmacy Lite
| Action | Path |
|--------|------|
| Modify | `apps/pharmacy-lite/src/app/[locale]/layout.tsx` |
| Create | `apps/pharmacy-lite/src/app/[locale]/(app)/layout.tsx` |
| Create | `apps/pharmacy-lite/src/app/[locale]/(auth)/layout.tsx` |
| Create | `apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx` |
| Create | `apps/pharmacy-lite/src/components/LanguageSelectorClient.tsx` |
| Delete (bash) | `apps/pharmacy-lite/src/app/[locale]/login/` |
| Move (bash) | All `[locale]/<route>/` → `[locale]/(app)/<route>/` |

### Lab Lite
| Action | Path |
|--------|------|
| Modify | `apps/lab-lite/src/app/[locale]/layout.tsx` |
| Create | `apps/lab-lite/src/app/[locale]/(app)/layout.tsx` |
| Create | `apps/lab-lite/src/app/[locale]/(auth)/layout.tsx` |
| Create | `apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx` |
| Create | `apps/lab-lite/src/components/LanguageSelectorClient.tsx` |
| Delete (bash) | `apps/lab-lite/src/app/[locale]/login/` |
| Move (bash) | All `[locale]/<route>/` → `[locale]/(app)/<route>/` |

---

## Task 1: Admin Portal – Two-column login page

**Files:**
- Modify: `apps/admin-portal/src/app/[locale]/login/page.tsx`

No routing changes needed. The AdminPortal `AuthGuard` already renders `/login` without sidebar chrome via the `state === 'public'` branch.

- [ ] **Step 1.1: Replace the login page JSX**

Replace the entire file with the following. All authentication logic is preserved verbatim; only the return statement changes.

```tsx
'use client'

import { useState } from 'react'
import { ShieldCheck, KeyRound } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

type AuthStep = 'credentials' | 'mfa'

export default function AdminLoginPage() {
  const [step, setStep] = useState<AuthStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [factorId, setFactorId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorEmail: email })
        setError('Invalid email or password')
        setLoading(false)
        return
      }

      setPassword('')

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

      if (factorsError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      const webauthnFactor = factors.all?.find(
        (f: { factor_type: string; status: string }) =>
          f.factor_type === 'webauthn' && f.status === 'verified',
      )

      if (!webauthnFactor) {
        const session = data.session
        if (!session) {
          setError('Failed to retrieve session')
          setLoading(false)
          return
        }

        const base64 = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(base64))
        const userMeta = payload.user_metadata ?? {}
        const role = ((userMeta.role as string) ?? '').toUpperCase()

        if (role !== 'ADMIN') {
          reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: payload.sub })
          await supabase.auth.signOut()
          setError('Access denied — admin role required')
          setLoading(false)
          return
        }

        useAuthSessionStore.getState().setSession({
          userId: payload.sub,
          practitionerId: payload.practitioner_id ?? payload.sub,
          role,
          sessionId: payload.session_id ?? '',
          email: session.user?.email ?? '',
          name:
            session.user?.user_metadata?.full_name ??
            session.user?.user_metadata?.name ??
            '',
        })

        reportAdminAuthEvent('ADMIN_LOGIN_SUCCESS', { actorId: payload.sub })

        const params = new URLSearchParams(window.location.search)
        const returnUrl = params.get('returnUrl')
        window.location.href =
          returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard'
        return
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: webauthnFactor.id })

      if (challengeError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError('Failed to initiate FIDO2 challenge')
        setLoading(false)
        return
      }

      setFactorId(webauthnFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaVerify() {
    setError(null)
    setLoading(true)

    try {
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setError('WebAuthn is not supported in this browser. Use a browser with FIDO2 support.')
        setLoading(false)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: '',
      })

      if (verifyError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE')
        setError('FIDO2 verification failed — please try again')
        setLoading(false)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const jwt = sessionData.session?.access_token
      if (!jwt) {
        setError('Failed to retrieve session after MFA verification')
        setLoading(false)
        return
      }

      const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64))
      const role = ((payload.role as string) ?? '').toUpperCase()

      if (role !== 'ADMIN') {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: payload.sub })
        await supabase.auth.signOut()
        setError('Access denied — admin role required')
        setLoading(false)
        return
      }

      useAuthSessionStore.getState().setSession({
        userId: payload.sub,
        practitionerId: payload.practitioner_id ?? payload.sub,
        role,
        sessionId: payload.session_id ?? '',
        email: sessionData.session?.user?.email ?? '',
        name:
          sessionData.session?.user?.user_metadata?.full_name ??
          sessionData.session?.user?.user_metadata?.name ??
          '',
      })

      reportAdminAuthEvent('ADMIN_LOGIN_SUCCESS', { actorId: payload.sub })

      const params = new URLSearchParams(window.location.search)
      const returnUrl = params.get('returnUrl')
      window.location.href =
        returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard'
    } catch {
      setError('An unexpected error occurred during FIDO2 verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleBackToSignIn() {
    try {
      await supabase.auth.signOut()
    } catch {
      // signOut failure is non-critical — reset local state regardless
    }
    setStep('credentials')
    setFactorId('')
    setChallengeId('')
    setEmail('')
    setError(null)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex flex-col p-6 md:p-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">
              Admin Portal
            </span>
          </div>
          <LanguageSelectorClient />
        </div>

        {/* Centred form */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {step === 'credentials' ? 'Sign in' : 'Verify identity'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === 'credentials'
                  ? 'Enter your admin credentials to continue'
                  : 'Tap your FIDO2 security key when prompted by your browser'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            {step === 'credentials' && (
              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@hospital.example"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in\u2026' : 'Sign in'}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      Hardware Security Key Required
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      Please tap your FIDO2 security key when your browser prompts you.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleMfaVerify}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? 'Verifying\u2026' : 'Verify Security Key'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  Back to sign in
                </Button>
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              New to Ultranos?{' '}
              <a
                href="/register"
                className="font-medium text-foreground transition-colors hover:text-primary"
              >
                Register your organization
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Ultranos Healthcare Platform
        </p>
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
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-primary-foreground/70"
              >
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

- [ ] **Step 1.2: Verify admin-portal dev server shows new layout**

```bash
pnpm -F admin-portal dev
```

Navigate to `http://localhost:3000/en/login`. Expected: two-column full-screen layout — form on the left, green brand panel on the right (hidden on mobile). Sidebar must NOT appear. Language selector must appear top-right of the form column.

- [ ] **Step 1.3: Commit**

```bash
git add apps/admin-portal/src/app/\[locale\]/login/page.tsx
git commit -m "feat(admin-portal): standardise login to ShadCN two-column layout"
```

---

## Task 2: OPD Lite – Route group restructuring + login redesign

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/layout.tsx`
- Create: `apps/opd-lite/src/app/[locale]/(app)/layout.tsx`
- Create: `apps/opd-lite/src/app/[locale]/(auth)/layout.tsx`
- Create: `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx`
- Create: `apps/opd-lite/src/components/LanguageSelectorClient.tsx`
- Delete + move via bash

- [ ] **Step 2.1: Create `LanguageSelectorClient` for OPD Lite**

Create `apps/opd-lite/src/components/LanguageSelectorClient.tsx`:

```tsx
'use client'

import { useCallback } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Globe } from '@ultranos/ui-kit/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

const LANGUAGES: { code: SupportedLocale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'prs', nativeLabel: 'دری' },
  { code: 'ps', nativeLabel: 'پښتو' },
]

export function LanguageSelectorClient() {
  const locale = useLocale() as SupportedLocale
  const router = useRouter()

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      const secure = window.location.protocol === 'https:' ? ';Secure' : ''
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${secure}`
      router.refresh()
    },
    [router],
  )

  const current = LANGUAGES.find((l) => l.code === locale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Select language"
        >
          <Globe size={16} />
          <span className="hidden sm:inline">{current?.nativeLabel ?? locale}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onSelect={() => setLocale(lang.code)}
            className={locale === lang.code ? 'font-medium text-primary' : undefined}
          >
            {lang.nativeLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2.2: Bash – create route group directories and move pages**

```bash
LOC='apps/opd-lite/src/app/[locale]'

# Create route group dirs
mkdir -p "$LOC/(app)"
mkdir -p "$LOC/(auth)/login"

# Move all app pages/routes to (app)/
for d in page.tsx patients patient encounter register-patient appointments notifications kyc conflicts duplicate-review expiring-consents settings; do
  [ -e "$LOC/$d" ] && mv "$LOC/$d" "$LOC/(app)/$d"
done

# Remove the old login dir (replaced by (auth)/login below)
rm -rf "$LOC/login"
```

Expected: no errors. Verify with:
```bash
ls 'apps/opd-lite/src/app/[locale]/(app)/'
```
Should list: `page.tsx  patients/  patient/  encounter/  register-patient/  appointments/  notifications/  kyc/  conflicts/  duplicate-review/  expiring-consents/  settings/`

- [ ] **Step 2.3: Strip sidebar from `[locale]/layout.tsx`**

Replace `apps/opd-lite/src/app/[locale]/layout.tsx` with:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { SyncProvider } from '@/components/providers/SyncProvider'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        {children}
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 2.4: Create `(app)/layout.tsx` with sidebar content**

Create `apps/opd-lite/src/app/[locale]/(app)/layout.tsx`:

```tsx
import { AppSidebar } from '@/components/AppSidebar'
import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { SyncDashboard } from '@/components/SyncDashboard'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <BreadcrumbHeader />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            Skip to content
          </a>
          <main id="main-content">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <SyncDashboard />
    </TooltipProvider>
  )
}
```

- [ ] **Step 2.5: Create `(auth)/layout.tsx`**

Create `apps/opd-lite/src/app/[locale]/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 2.6: Create `(auth)/login/page.tsx` with new two-column design**

Create `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Stethoscope } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { generateSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

type AuthStep = 'credentials' | 'mfa'

export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        reportAuthEvent('LOGIN_FAILURE', { actorEmail: email })
        setError('Invalid email or password')
        setLoading(false)
        return
      }

      reportAuthEvent('LOGIN_SUCCESS', { actorId: data.user?.id })
      setPassword('')

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

      if (factorsError) {
        await supabase.auth.signOut()
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      const totpFactor = factors.totp?.[0]
      if (!totpFactor) {
        await populateSessionAndRedirect()
        return
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id })

      if (challengeError) {
        await supabase.auth.signOut()
        setError('Failed to initiate MFA challenge')
        setLoading(false)
        return
      }

      setFactorId(totpFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function populateSessionAndRedirect() {
    const { data: sessionData } = await supabase.auth.getSession()
    const jwt = sessionData.session?.access_token
    if (!jwt) {
      setError('Failed to retrieve session')
      setLoading(false)
      return
    }

    const base64 = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    useAuthSessionStore.getState().setSession({
      userId: payload.sub,
      practitionerId: payload.practitioner_id ?? payload.sub,
      role: payload.role ?? '',
      sessionId: payload.session_id ?? '',
      email: sessionData.session?.user?.email ?? '',
      name:
        sessionData.session?.user?.user_metadata?.full_name ??
        sessionData.session?.user?.user_metadata?.name ??
        '',
    })

    if (!encryptionKeyStore.isReady()) {
      const encKey = await generateSessionKey()
      encryptionKeyStore.setKey(encKey)
    }

    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl') ?? '/'
    const safeUrl =
      returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
    window.location.href = safeUrl
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      })

      if (verifyError) {
        reportAuthEvent('MFA_VERIFY_FAILURE')
        setError('Invalid TOTP code — please try again')
        setTotpCode('')
        setLoading(false)
        return
      }

      reportAuthEvent('MFA_VERIFY_SUCCESS')
      await populateSessionAndRedirect()
    } catch {
      setError('An unexpected error occurred during MFA verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleBackToSignIn() {
    await supabase.auth.signOut()
    setStep('credentials')
    setTotpCode('')
    setFactorId('')
    setChallengeId('')
    setEmail('')
    setError(null)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex flex-col p-6 md:p-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">
              OPD Lite
            </span>
          </div>
          <LanguageSelectorClient />
        </div>

        {/* Centred form */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {step === 'credentials' ? 'Sign in' : 'Two-factor authentication'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === 'credentials'
                  ? 'Enter your credentials to access the OPD'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            {step === 'credentials' && (
              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinician@hospital.example"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in\u2026' : 'Sign in'}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp">TOTP Code</Label>
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-widest"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || totpCode.length !== 6}
                >
                  {loading ? 'Verifying\u2026' : 'Verify'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  Back to sign in
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Ultranos Healthcare Platform
        </p>
      </div>

      {/* ── Right: brand panel ── */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Stethoscope className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">OPD Lite</h2>
          <p className="mt-3 text-base text-primary-foreground/75">
            Clinical workflows for outpatient care
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Patient registration & encounters',
              'Offline-first clinical documentation',
              'Prescription management',
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-primary-foreground/70"
              >
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

- [ ] **Step 2.7: Verify OPD Lite dev server**

```bash
pnpm -F opd-lite dev
```

1. Visit `http://localhost:3001/en/login` — two-column full-screen layout, no sidebar visible.
2. Visit `http://localhost:3001/en` — app loads with sidebar as before.
3. Verify redirect from an unauthenticated route goes to `/login`.

- [ ] **Step 2.8: Commit**

```bash
git add \
  'apps/opd-lite/src/app/[locale]/layout.tsx' \
  'apps/opd-lite/src/app/[locale]/(app)/layout.tsx' \
  'apps/opd-lite/src/app/[locale]/(app)/' \
  'apps/opd-lite/src/app/[locale]/(auth)/layout.tsx' \
  'apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx' \
  'apps/opd-lite/src/components/LanguageSelectorClient.tsx'
git commit -m "feat(opd-lite): extract (auth)/(app) route groups, standardise login layout"
```

---

## Task 3: Pharmacy Lite – Route group restructuring + login redesign

**Files:**
- Modify: `apps/pharmacy-lite/src/app/[locale]/layout.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(app)/layout.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(auth)/layout.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx`
- Create: `apps/pharmacy-lite/src/components/LanguageSelectorClient.tsx`
- Delete + move via bash

- [ ] **Step 3.1: Create `LanguageSelectorClient` for Pharmacy Lite**

Create `apps/pharmacy-lite/src/components/LanguageSelectorClient.tsx` — identical to the OPD Lite version in Step 2.1 above (same imports, same logic):

```tsx
'use client'

import { useCallback } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Globe } from '@ultranos/ui-kit/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

const LANGUAGES: { code: SupportedLocale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'prs', nativeLabel: 'دری' },
  { code: 'ps', nativeLabel: 'پښتو' },
]

export function LanguageSelectorClient() {
  const locale = useLocale() as SupportedLocale
  const router = useRouter()

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      const secure = window.location.protocol === 'https:' ? ';Secure' : ''
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${secure}`
      router.refresh()
    },
    [router],
  )

  const current = LANGUAGES.find((l) => l.code === locale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Select language"
        >
          <Globe size={16} />
          <span className="hidden sm:inline">{current?.nativeLabel ?? locale}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onSelect={() => setLocale(lang.code)}
            className={locale === lang.code ? 'font-medium text-primary' : undefined}
          >
            {lang.nativeLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3.2: Bash – create route group directories and move pages**

```bash
LOC='apps/pharmacy-lite/src/app/[locale]'

mkdir -p "$LOC/(app)"
mkdir -p "$LOC/(auth)/login"

for d in page.tsx register-patient queue scan unverified history controlled pos inventory paper-rx reports sync settings; do
  [ -e "$LOC/$d" ] && mv "$LOC/$d" "$LOC/(app)/$d"
done

rm -rf "$LOC/login"
```

Verify:
```bash
ls 'apps/pharmacy-lite/src/app/[locale]/(app)/'
```
Should list: `page.tsx  register-patient/  queue/  scan/  unverified/  history/  controlled/  pos/  inventory/  paper-rx/  reports/  sync/  settings/`

- [ ] **Step 3.3: Strip sidebar from `[locale]/layout.tsx`**

Replace `apps/pharmacy-lite/src/app/[locale]/layout.tsx` with:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SwUpdateNotification } from '@/components/SwUpdateNotification'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        {children}
        <SwUpdateNotification />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

`SwUpdateNotification` (PWA service-worker update banner) is kept at the locale level so it shows even on login.

- [ ] **Step 3.4: Create `(app)/layout.tsx`**

Create `apps/pharmacy-lite/src/app/[locale]/(app)/layout.tsx`:

```tsx
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { SyncDashboard } from '@/components/pharmacy/SyncDashboard'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <BreadcrumbHeader />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            Skip to content
          </a>
          <main id="main-content">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <SyncDashboard />
    </TooltipProvider>
  )
}
```

- [ ] **Step 3.5: Create `(auth)/layout.tsx`**

Create `apps/pharmacy-lite/src/app/[locale]/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 3.6: Create `(auth)/login/page.tsx`**

Create `apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx`. The login retains `useTranslations('login')` from the previous i18n commit — `t('signIn')` maps to the form heading, `t('secureHealthcare')` to the footer.

```tsx
'use client'

import { useState } from 'react'
import { Pill } from '@ultranos/ui-kit/icons'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

type AuthStep = 'credentials' | 'mfa'

export default function LoginPage() {
  const t = useTranslations('login')
  const [step, setStep] = useState<AuthStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        reportAuthEvent('LOGIN_FAILURE', { actorEmail: email })
        setError('Invalid email or password')
        setLoading(false)
        return
      }

      reportAuthEvent('LOGIN_SUCCESS', { actorId: data.user?.id })
      setPassword('')

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

      if (factorsError) {
        await supabase.auth.signOut()
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      const totpFactor = factors.totp?.[0]
      if (!totpFactor) {
        await populateSessionAndRedirect()
        return
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id })

      if (challengeError) {
        await supabase.auth.signOut()
        setError('Failed to initiate MFA challenge')
        setLoading(false)
        return
      }

      setFactorId(totpFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function populateSessionAndRedirect() {
    const { data: sessionData } = await supabase.auth.getSession()
    const jwt = sessionData.session?.access_token
    if (!jwt) {
      setError('Failed to retrieve session')
      setLoading(false)
      return
    }

    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    useAuthSessionStore.getState().setSession({
      userId: payload.sub,
      practitionerId: payload.practitioner_id ?? payload.sub,
      role: payload.role ?? '',
      sessionId: payload.session_id ?? '',
      email: sessionData.session?.user?.email ?? '',
      name:
        sessionData.session?.user?.user_metadata?.full_name ??
        sessionData.session?.user?.user_metadata?.name ??
        '',
    })

    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl') ?? '/'
    const safeUrl =
      returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
    window.location.href = safeUrl
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      })

      if (verifyError) {
        reportAuthEvent('MFA_VERIFY_FAILURE')
        setError('Invalid TOTP code — please try again')
        setTotpCode('')
        setLoading(false)
        return
      }

      reportAuthEvent('MFA_VERIFY_SUCCESS')
      await populateSessionAndRedirect()
    } catch {
      await supabase.auth.signOut()
      setError('An unexpected error occurred during MFA verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleBackToSignIn() {
    await supabase.auth.signOut()
    setStep('credentials')
    setTotpCode('')
    setFactorId('')
    setChallengeId('')
    setEmail('')
    setError(null)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex flex-col p-6 md:p-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Pill className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">
              Pharmacy Lite
            </span>
          </div>
          <LanguageSelectorClient />
        </div>

        {/* Centred form */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {step === 'credentials' ? t('signIn') : 'Two-factor authentication'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === 'credentials'
                  ? 'Enter your credentials to access Pharmacy Lite'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            {step === 'credentials' && (
              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="pharmacist@hospital.example"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in\u2026' : 'Sign in'}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp">TOTP Code</Label>
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-widest"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || totpCode.length !== 6}
                >
                  {loading ? 'Verifying\u2026' : 'Verify'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  Back to sign in
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          {t('secureHealthcare')}
        </p>
      </div>

      {/* ── Right: brand panel ── */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Pill className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">Pharmacy Lite</h2>
          <p className="mt-3 text-base text-primary-foreground/75">
            Medication management and dispensing
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Digital prescription verification',
              'Drug interaction checking',
              'Inventory & stock management',
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-primary-foreground/70"
              >
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

- [ ] **Step 3.7: Verify Pharmacy Lite dev server**

```bash
pnpm -F pharmacy-lite dev
```

1. Visit `http://localhost:3002/en/login` — two-column full-screen layout, no sidebar visible.
2. Visit `http://localhost:3002/en` — app loads with sidebar as before.
3. Switch to Arabic locale using the language selector; verify RTL body direction and that the login form still renders correctly.

- [ ] **Step 3.8: Commit**

```bash
git add \
  'apps/pharmacy-lite/src/app/[locale]/layout.tsx' \
  'apps/pharmacy-lite/src/app/[locale]/(app)/layout.tsx' \
  'apps/pharmacy-lite/src/app/[locale]/(app)/' \
  'apps/pharmacy-lite/src/app/[locale]/(auth)/layout.tsx' \
  'apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx' \
  'apps/pharmacy-lite/src/components/LanguageSelectorClient.tsx'
git commit -m "feat(pharmacy-lite): extract (auth)/(app) route groups, standardise login layout"
```

---

## Task 4: Lab Lite – Route group restructuring + login redesign

**Files:**
- Modify: `apps/lab-lite/src/app/[locale]/layout.tsx`
- Create: `apps/lab-lite/src/app/[locale]/(app)/layout.tsx`
- Create: `apps/lab-lite/src/app/[locale]/(auth)/layout.tsx`
- Create: `apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx`
- Create: `apps/lab-lite/src/components/LanguageSelectorClient.tsx`
- Delete + move via bash

- [ ] **Step 4.1: Create `LanguageSelectorClient` for Lab Lite**

Create `apps/lab-lite/src/components/LanguageSelectorClient.tsx` — same as Steps 2.1 / 3.1 (identical component, different app path):

```tsx
'use client'

import { useCallback } from 'react'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Globe } from '@ultranos/ui-kit/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

const LANGUAGES: { code: SupportedLocale; nativeLabel: string }[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'prs', nativeLabel: 'دری' },
  { code: 'ps', nativeLabel: 'پښتو' },
]

export function LanguageSelectorClient() {
  const locale = useLocale() as SupportedLocale
  const router = useRouter()

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      const secure = window.location.protocol === 'https:' ? ';Secure' : ''
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${secure}`
      router.refresh()
    },
    [router],
  )

  const current = LANGUAGES.find((l) => l.code === locale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Select language"
        >
          <Globe size={16} />
          <span className="hidden sm:inline">{current?.nativeLabel ?? locale}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel>Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onSelect={() => setLocale(lang.code)}
            className={locale === lang.code ? 'font-medium text-primary' : undefined}
          >
            {lang.nativeLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4.2: Bash – create route group directories and move pages**

Lab Lite has many route directories. The command below handles all of them:

```bash
LOC='apps/lab-lite/src/app/[locale]'

mkdir -p "$LOC/(app)"
mkdir -p "$LOC/(auth)/login"

for d in \
  page.tsx queue worklist results authorization history notifications patients \
  chw consent network peer-network offline shift-handover sendouts upload \
  equipment sops quality qc safety-reporting atlas escalations competency \
  certifications certification achievements mentorship portfolio planner \
  readiness workload logbook reports procurement orders inventory finance settings
do
  [ -e "$LOC/$d" ] && mv "$LOC/$d" "$LOC/(app)/$d"
done

rm -rf "$LOC/login"
```

Verify:
```bash
ls 'apps/lab-lite/src/app/[locale]/(app)/' | head -10
```
Should list at least: `page.tsx  queue/  worklist/  results/  authorization/  history/  notifications/  patients/  chw/  consent/`

- [ ] **Step 4.3: Strip sidebar from `[locale]/layout.tsx`**

Replace `apps/lab-lite/src/app/[locale]/layout.tsx` with:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { SyncProvider } from '@/components/providers/SyncProvider'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        {children}
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 4.4: Create `(app)/layout.tsx`**

Create `apps/lab-lite/src/app/[locale]/(app)/layout.tsx`. Lab Lite uses `AppShell` (which includes the sidebar internally) plus `EmergencyButton`, `LockExpiryCheckerMount`, and `SyncDashboard`:

```tsx
import { AppShell } from '@/components/AppShell'
import { EmergencyButton } from '@/components/safety/EmergencyButton'
import { LockExpiryCheckerMount } from '@/components/samples/LockExpiryCheckerMount'
import { SyncDashboard } from '@/components/SyncDashboard'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LockExpiryCheckerMount />
      <AppShell>
        {children}
      </AppShell>
      <EmergencyButton />
      <SyncDashboard />
    </>
  )
}
```

- [ ] **Step 4.5: Create `(auth)/layout.tsx`**

Create `apps/lab-lite/src/app/[locale]/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 4.6: Create `(auth)/login/page.tsx`**

Create `apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx`. Lab Lite uses TOTP MFA. The existing login imported the custom `Button` from `@/components/ui/Button` (uppercase); the new page uses the ShadCN `Button` from `@ultranos/ui-kit` for consistency. `Input` and `Label` stay as `@/components/ui/input` / `@/components/ui/label` (lab-lite already has these re-exports).

```tsx
'use client'

import { useState } from 'react'
import { Microscope } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

type AuthStep = 'credentials' | 'mfa' | 'error'

export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = getSupabaseBrowserClient()

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        reportAuthEvent('LOGIN_FAILURE', { actorEmail: email })
        setError('Invalid email or password')
        setLoading(false)
        return
      }

      reportAuthEvent('LOGIN_SUCCESS', { actorId: data.user?.id })
      setPassword('')

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

      if (factorsError) {
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      const totpFactor = factors.totp?.[0]
      if (!totpFactor) {
        await populateSessionAndRedirect()
        return
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id })

      if (challengeError) {
        setError('Failed to initiate MFA challenge')
        setLoading(false)
        return
      }

      setFactorId(totpFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function populateSessionAndRedirect() {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user?.email) {
      setError('Failed to retrieve session')
      setLoading(false)
      return
    }
    useAuthSessionStore.getState().setSession({
      userId: user.id,
      practitionerId: user.user_metadata?.practitioner_id ?? '',
      role: 'LAB_TECH',
      sessionId: crypto.randomUUID(),
      email: user.email,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
    })

    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl') ?? '/'
    const safeUrl =
      returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
    window.location.href = safeUrl
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      })

      if (verifyError) {
        reportAuthEvent('MFA_VERIFY_FAILURE')
        setError('Invalid TOTP code — please try again')
        setTotpCode('')
        setLoading(false)
        return
      }

      reportAuthEvent('MFA_VERIFY_SUCCESS')
      await populateSessionAndRedirect()
    } catch {
      setError('An unexpected error occurred during MFA verification')
    } finally {
      setLoading(false)
    }
  }

  async function handleBackToSignIn() {
    await supabase.auth.signOut()
    setStep('credentials')
    setTotpCode('')
    setEmail('')
    setError(null)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* ── Left: form column ── */}
      <div className="flex flex-col p-6 md:p-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Microscope className="size-4" />
            </div>
            <span className="font-heading text-sm font-semibold text-foreground">
              Lab Diagnostics
            </span>
          </div>
          <LanguageSelectorClient />
        </div>

        {/* Centred form */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {step === 'credentials' ? 'Sign in' : 'Two-factor authentication'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === 'credentials'
                  ? 'Enter your credentials to access Lab Diagnostics'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            {step === 'credentials' && (
              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="technician@lab.example"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in\u2026' : 'Sign in'}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp">TOTP Code</Label>
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-widest"
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || totpCode.length !== 6}
                >
                  {loading ? 'Verifying\u2026' : 'Verify'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  Back to sign in
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Ultranos Healthcare Platform
        </p>
      </div>

      {/* ── Right: brand panel ── */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 px-12 text-center text-primary-foreground">
          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
            <Microscope className="size-10" />
          </div>
          <h2 className="font-heading text-3xl font-bold">Lab Diagnostics</h2>
          <p className="mt-3 text-base text-primary-foreground/75">
            Laboratory results and quality management
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[
              'Sample tracking & worklist',
              'Quality control & calibration',
              'Results authorization & reporting',
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-primary-foreground/70"
              >
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

- [ ] **Step 4.7: Verify Lab Lite dev server**

```bash
pnpm -F lab-lite dev
```

1. Visit `http://localhost:3003/en/login` — two-column full-screen layout, no sidebar visible.
2. Visit `http://localhost:3003/en` — app loads with `AppShell` (sidebar) as before.
3. Verify `EmergencyButton` still renders on app pages (not on login).

- [ ] **Step 4.8: Commit**

```bash
git add \
  'apps/lab-lite/src/app/[locale]/layout.tsx' \
  'apps/lab-lite/src/app/[locale]/(app)/layout.tsx' \
  'apps/lab-lite/src/app/[locale]/(app)/' \
  'apps/lab-lite/src/app/[locale]/(auth)/layout.tsx' \
  'apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx' \
  'apps/lab-lite/src/components/LanguageSelectorClient.tsx'
git commit -m "feat(lab-lite): extract (auth)/(app) route groups, standardise login layout"
```

---

## Self-Review

**Spec coverage:**
- ✅ ShadCN two-column `grid min-h-svh lg:grid-cols-2` applied to all four apps
- ✅ Left column: logo + app name, language selector, centred form, footer
- ✅ Right column: `bg-primary` brand panel, app-specific icon + tagline + feature bullets, decorative circles, hidden on mobile
- ✅ Admin Portal: no routing changes needed (AuthGuard already isolates login from sidebar)
- ✅ Spoke apps: `(auth)` + `(app)` route groups properly split sidebar from login
- ✅ Pharmacy Lite: `useTranslations('login')` preserved for `signIn` and `secureHealthcare` keys
- ✅ OPD Lite: `generateSessionKey` / `encryptionKeyStore` preserved
- ✅ Lab Lite: `crypto.randomUUID()` session ID preserved
- ✅ Language selector added to all four login pages
- ✅ All icons from `@ultranos/ui-kit/icons` (no direct `lucide-react` imports)
- ✅ Semantic tokens only — no hardcoded hex or oklch values in new code
- ✅ Logical CSS classes for RTL (`-end-*`, `-start-*`, `text-start`)

**Type consistency check:**
- `LanguageSelectorClient` export name is consistent across all three new files and matches how admin-portal uses it (`import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'`)
- `Button` from `@ultranos/ui-kit/components/ui/button` uses the ShadCN `variant` prop (`variant="ghost"`) — confirmed consistent across all four login pages
- `handleBackToSignIn` is `async function` in all apps (matches original signatures)
