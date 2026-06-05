'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
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

  const t = useTranslations('auth')
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

      const webauthnFactor = factors.all?.find(
        (f: { factor_type: string; status: string }) =>
          f.factor_type === 'webauthn' && f.status === 'verified',
      )

      if (!webauthnFactor) {
        const session = data.session
        if (!session) {
          setError(t('errorRetrieveSession'))
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
        setError(t('errorFidoChallenge'))
        setLoading(false)
        return
      }

      setFactorId(webauthnFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError(t('errorUnexpected'))
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaVerify() {
    setError(null)
    setLoading(true)

    try {
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setError(t('errorWebAuthnUnsupported'))
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
        setError(t('errorFidoFailed'))
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
      const role = ((payload.role as string) ?? '').toUpperCase()

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
      const returnUrl = params.get('returnUrl')
      window.location.href =
        returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard'
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
                {step === 'credentials' ? t('signInSubtitle') : t('fidoSubtitle')}
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
                    onChange={(e) => setEmail(e.target.value)}
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('signingIn') : t('signIn')}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      {t('fidoTitle')}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {t('fidoBody')}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleMfaVerify}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? t('verifying') : t('verifySecurityKey')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  {t('backToSignIn')}
                </Button>
              </div>
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
