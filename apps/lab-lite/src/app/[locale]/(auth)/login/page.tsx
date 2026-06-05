'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import { Microscope } from '@ultranos/ui-kit/icons'

type AuthStep = 'credentials' | 'mfa'

/**
 * Lab Lite Login Page — two-column layout
 * Story 12.1 AC 1: Lab technicians authenticate via Supabase Auth with TOTP MFA enforced.
 *
 * Flow:
 * 1. Email + password credentials
 * 2. TOTP MFA challenge (required for all clinical staff per PRD CL-07)
 * 3. Redirect to upload dashboard on success
 */
export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
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
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        reportAuthEvent('LOGIN_FAILURE')
        setError(t('invalidCredentials'))
        setLoading(false)
        return
      }

      reportAuthEvent('LOGIN_SUCCESS', { actorId: data.user?.id })

      // Clear credentials from state after successful auth
      setPassword('')

      // Check if MFA is required
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors()

      if (factorsError) {
        await supabase.auth.signOut()
        setError(t('mfaFactorsError'))
        setLoading(false)
        return
      }

      const totpFactor = factors.totp?.[0]
      if (!totpFactor) {
        await supabase.auth.signOut()
        setError(t('mfaRequired'))
        setLoading(false)
        return
      }

      // Create MFA challenge
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: totpFactor.id })

      if (challengeError) {
        await supabase.auth.signOut()
        setError(t('mfaChallengeError'))
        setLoading(false)
        return
      }

      setFactorId(totpFactor.id)
      setChallengeId(challenge.id)
      setStep('mfa')
    } catch {
      setError(t('unexpectedError'))
    } finally {
      setLoading(false)
    }
  }

  async function populateSessionAndRedirect() {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user?.email) {
      setError(t('sessionUnavailable'))
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
      labRole: user.user_metadata?.lab_role ?? null,
    })

    const params = new URLSearchParams(window.location.search)
    const returnUrl = params.get('returnUrl') ?? '/'
    const safeUrl = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
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
        setError(t('invalidTotp'))
        setTotpCode('')
        setLoading(false)
        return
      }

      reportAuthEvent('MFA_VERIFY_SUCCESS')
      await populateSessionAndRedirect()
    } catch {
      setError(t('unexpectedMfaError'))
    } finally {
      setLoading(false)
    }
  }

  async function handleBackToSignIn() {
    // Revoke the partial session (authenticated at password level, not MFA-verified)
    await supabase.auth.signOut()
    setStep('credentials')
    setTotpCode('')
    setEmail('')
    setError(null)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left panel — form */}
      <div className="flex flex-col p-6 md:p-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Microscope size={16} />
            </div>
            <span className="text-sm font-semibold text-foreground">Lab Lite</span>
          </div>
          <LanguageSelectorClient />
        </div>

        {/* Centered form area */}
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
            <div className="space-y-2 text-start">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {step === 'credentials' ? t('signInTitle') : t('mfaTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {step === 'credentials' ? t('signInSubtitle') : t('totpPrompt')}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            {step === 'credentials' && (
              <form onSubmit={handleCredentialSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t('email')}</Label>
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
                <div className="space-y-1.5">
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
                <Button variant="primary" type="submit" disabled={loading} fullWidth>
                  {loading ? t('signingIn') : t('signIn')}
                </Button>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="totp">{t('totpCode')}</Label>
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
                  variant="primary"
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  fullWidth
                >
                  {loading ? t('verifying') : t('verify')}
                </Button>
                <Button variant="ghost" type="button" onClick={handleBackToSignIn} fullWidth>
                  {t('backToSignIn')}
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Secure clinical laboratory diagnostics platform
        </p>
      </div>

      {/* Right panel — brand */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute -end-32 -top-32 size-[28rem] rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-40 -start-16 size-96 rounded-full bg-primary-foreground/5" />
        <div className="relative z-10 flex flex-col items-center gap-6 px-10 text-center text-primary-foreground">
          <Microscope size={40} />
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Lab Lite</h2>
            <p className="text-base text-primary-foreground/80">
              Diagnostic result entry and quality control
            </p>
          </div>
          <ul className="mt-2 space-y-2 text-sm text-primary-foreground/70">
            <li>Barcode scan &amp; result entry</li>
            <li>Quality control charts</li>
            <li>AI-assisted result validation</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
