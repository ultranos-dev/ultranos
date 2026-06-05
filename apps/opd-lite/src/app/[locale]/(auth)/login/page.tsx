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
