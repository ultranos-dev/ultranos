'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Pill } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { deriveSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore, getOrCreateDeviceSalt } from '@/lib/encryption-key-store'

type AuthStep = 'credentials' | 'mfa'

export default function LoginPage() {
  const t = useTranslations('login')
  const tAuth = useTranslations('auth')
  const searchParams = useSearchParams()
  const router = useRouter()
  const resetSuccess = searchParams.get('reset') === 'success'
  const [step, setStep] = useState<AuthStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showResetBanner, setShowResetBanner] = useState(resetSuccess)

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
        setError(tAuth('invalidCredentials'))
        setLoading(false)
        return
      }

      reportAuthEvent('LOGIN_SUCCESS', { actorId: data.user?.id })
      setPassword('')

      // TODO: MFA temporarily disabled — re-enable before production
      await populateSessionAndRedirect()
    } catch {
      setError(tAuth('unexpectedError'))
    } finally {
      setLoading(false)
    }
  }

  async function populateSessionAndRedirect() {
    const { data: sessionData } = await supabase.auth.getSession()
    const jwt = sessionData.session?.access_token
    if (!jwt) {
      setError(tAuth('sessionRetrievalError'))
      setLoading(false)
      return
    }

    const jwtPart = jwt.split('.')[1]
    if (!jwtPart) throw new Error('Invalid JWT format')
    const base64 = jwtPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))

    if (!encryptionKeyStore.isReady()) {
      // Derive the SAME deterministic key AuthGuard re-derives on refresh
      // (PBKDF2 over the Supabase user id + device salt). A random key here left
      // data written this session undecryptable after reload. payload.sub ===
      // session.user.id, matching AuthGuard's deriveSessionKey(...) input.
      const derivedKey = await deriveSessionKey(payload.sub, getOrCreateDeviceSalt())
      encryptionKeyStore.setKey(derivedKey)
    }
    useAuthSessionStore.getState().setSession({
      userId: payload.sub,
      practitionerId: payload.practitioner_id ?? payload.sub,
      role: (payload.role !== 'authenticated' ? payload.role : null) ?? sessionData.session?.user?.user_metadata?.role ?? '',
      sessionId: payload.session_id ?? '',
      email: sessionData.session?.user?.email ?? '',
      name: (() => {
        const m = sessionData.session?.user?.user_metadata
        return m?.full_name ?? m?.name ??
          ((m?.given_name || m?.family_name) ? `${m?.given_name ?? ''} ${m?.family_name ?? ''}`.trim() : '')
      })(),
    })

    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl') ?? '/'
    const safeUrl =
      returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
    router.push(safeUrl)
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
        setError(tAuth('invalidTotp'))
        setTotpCode('')
        setLoading(false)
        return
      }

      reportAuthEvent('MFA_VERIFY_SUCCESS')
      await populateSessionAndRedirect()
    } catch {
      await supabase.auth.signOut()
      setError(tAuth('unexpectedMfaError'))
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
            {showResetBanner && (
              <div
                role="status"
                className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary"
              >
                <span>{tAuth('resetSuccess')}</span>
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
                {step === 'credentials' ? t('signIn') : tAuth('mfaTitle')}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {step === 'credentials' ? tAuth('signInSubtitle') : tAuth('totpPrompt')}
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
                  <Label htmlFor="email">{tAuth('email')}</Label>
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
                  <Label htmlFor="password">{tAuth('password')}</Label>
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
                    {tAuth('forgotPassword')}
                  </Link>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? tAuth('signingIn') : tAuth('signIn')}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp">{tAuth('totpCode')}</Label>
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
                  {loading ? tAuth('verifying') : tAuth('verify')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToSignIn}
                  className="w-full"
                >
                  {tAuth('backToSignIn')}
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">Ultranos Healthcare Platform</p>
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
            {tAuth('panelTagline')}
          </p>
          <ul className="mt-10 space-y-2 text-start">
            {[tAuth('panelFeature1'), tAuth('panelFeature2'), tAuth('panelFeature3')].map((item) => (
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
