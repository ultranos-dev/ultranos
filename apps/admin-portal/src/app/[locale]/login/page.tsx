'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ShieldCheck, KeyRound } from '@ultranos/ui-kit/icons'
import { Checkbox } from '@ultranos/ui-kit/components/ui/checkbox'
// Story 56.3: admin login uses a real Supabase TOTP challenge (not the former
// empty-code WebAuthn ceremony). The challenge runs ONLY when the signed-in admin
// has a verified TOTP factor — which only exists once their org enabled MFA and
// they enrolled. With MFA off (the default) no factor exists → password-only login,
// behaviorally identical to before (AC 2, AC 7).
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { safeReturnUrl } from '@/lib/safe-redirect'
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
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)

  const t = useTranslations('auth')

  // "Remember email": prefill a previously-saved email and keep it in sync.
  // The login email is a staff identifier (not PHI), so localStorage is fine.
  const REMEMBER_EMAIL_KEY = 'ultranos.rememberedEmail'
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        setEmail(saved)
        setRememberEmail(true)
      }
    } catch {
      // localStorage unavailable — skip prefill
    }
  }, [])

  function handleRememberToggle(checked: boolean) {
    setRememberEmail(checked)
    try {
      if (checked) localStorage.setItem(REMEMBER_EMAIL_KEY, email)
      else localStorage.removeItem(REMEMBER_EMAIL_KEY)
    } catch {
      // localStorage unavailable — ignore
    }
  }

  function handleEmailChange(value: string) {
    setEmail(value)
    if (rememberEmail) {
      try {
        localStorage.setItem(REMEMBER_EMAIL_KEY, value)
      } catch {
        // localStorage unavailable — ignore
      }
    }
  }
  const searchParams = useSearchParams()
  const router = useRouter()
  const resetSuccess = searchParams.get('reset') === 'success'
  const [showResetBanner, setShowResetBanner] = useState(resetSuccess)

  const supabase = getSupabaseBrowserClient()

  async function handleCredentialSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorEmail: email })
        setError(t('errorInvalidCredentials'))
        setLoading(false)
        return
      }

      setPassword('')

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

      if (factorsError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError(t('errorMfaFactors'))
        setLoading(false)
        return
      }

      // Story 56.3: look for a verified TOTP factor. Only present when the org
      // enabled MFA and this admin enrolled; otherwise login proceeds password-only.
      const totpFactor = factors.totp?.find(
        (f: { status: string }) => f.status === 'verified',
      )

      if (!totpFactor) {
        const session = data.session
        if (!session) {
          setError(t('errorRetrieveSession'))
          setLoading(false)
          return
        }

        const base64 = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(base64))
        // Story 56.1: role from app_metadata (server-authoritative); user_metadata
        // is a temporary fallback for pre-migration sessions. Display/routing only —
        // enforcement is hub-side.
        const appMeta = payload.app_metadata ?? {}
        const userMeta = payload.user_metadata ?? {}
        const role = (((appMeta.role ?? userMeta.role) as string) ?? '').toUpperCase()

        if (role !== 'ADMIN') {
          reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: payload.sub })
          await supabase.auth.signOut()
          setError(t('errorAccessDenied'))
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
        // Story 56.4 (H-ADM-1): only honor same-origin path redirects — blocks
        // //evil.com and /\evil.com open-redirect payloads.
        window.location.href = safeReturnUrl(params.get('returnUrl'), '/dashboard')
        return
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id })

      if (challengeError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError(t('errorMfaChallenge'))
        setLoading(false)
        return
      }

      setFactorId(totpFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError(t('errorUnexpected'))
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Story 56.3: real TOTP verification with the user-entered 6-digit code.
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      })

      if (verifyError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE')
        setError(t('errorMfaInvalidCode'))
        setTotpCode('')
        setLoading(false)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const jwt = sessionData.session?.access_token
      if (!jwt) {
        setError(t('errorSessionMfa'))
        setLoading(false)
        return
      }

      const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64))
      // Story 56.1: prefer app_metadata role (server-authoritative), then the
      // temporary user_metadata fallback, then the legacy top-level claim.
      const role = (((payload.app_metadata?.role ?? payload.user_metadata?.role ?? payload.role) as string) ?? '').toUpperCase()

      if (role !== 'ADMIN') {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: payload.sub })
        await supabase.auth.signOut()
        setError(t('errorAccessDenied'))
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
      // Story 56.4 (H-ADM-1): only honor same-origin path redirects.
      window.location.href = safeReturnUrl(params.get('returnUrl'), '/dashboard')
    } catch {
      setError(t('errorUnexpectedMfa'))
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
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {step === 'credentials' ? t('signIn') : t('verifyIdentity')}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === 'credentials' ? t('signInSubtitle') : t('mfaSubtitle')}
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
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="admin@hospital.example"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer select-none items-center gap-2">
                    <Checkbox
                      checked={rememberEmail}
                      onChange={(e) => handleRememberToggle(e.target.checked)}
                    />
                    <span className="text-sm text-muted-foreground">{t('rememberEmail')}</span>
                  </label>
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('signingIn') : t('signIn')}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={handleMfaVerify} className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      {t('mfaTitle')}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {t('mfaBody')}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totp">{t('mfaCodeLabel')}</Label>
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || totpCode.length < 6}
                  className="w-full"
                >
                  {loading ? t('verifying') : t('verifyCode')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  {t('backToSignIn')}
                </Button>
              </form>
            )}

            <p className="text-center text-xs text-muted-foreground">
              {t('newToUltranos')}{' '}
              <a
                href="/register"
                className="font-medium text-foreground transition-colors hover:text-primary"
              >
                {t('registerOrg')}
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
            {t('panelTagline')}
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[t('panelFeature1'), t('panelFeature2'), t('panelFeature3')].map((item) => (
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
