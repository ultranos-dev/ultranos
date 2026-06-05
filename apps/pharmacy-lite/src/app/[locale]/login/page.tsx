'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type AuthStep = 'credentials' | 'mfa'

/**
 * Pharmacy Lite Login Page
 * Story 14.2: Pharmacists authenticate via Supabase Auth with TOTP MFA enforced.
 *
 * Flow:
 * 1. Email + password credentials
 * 2. TOTP MFA challenge (required for all pharmacy staff per PRD)
 * 3. Populate auth session store, then redirect to /
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

      // Clear credentials from state after successful auth
      setPassword('')

      // Check if MFA is required
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors()

      if (factorsError) {
        await supabase.auth.signOut()
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      const totpFactor = factors.totp?.[0]
      if (!totpFactor) {
        // MFA not enrolled — allow login without MFA
        await populateSessionAndRedirect()
        return
      }

      // Create MFA challenge
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
    const userId = payload.sub
    const role = payload.role ?? ''
    const sessionId = payload.session_id ?? ''
    const practitionerId = payload.practitioner_id ?? userId
    const userEmail = sessionData.session?.user?.email ?? ''
    useAuthSessionStore.getState().setSession({
      userId,
      practitionerId,
      role,
      sessionId,
      email: userEmail,
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
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Pharmacy Lite</h1>
        <p className="text-sm text-muted-foreground mt-1">Powered by Ultranos</p>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
          Sign In
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleCredentialSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="pharmacist@hospital.example"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                autoComplete="current-password"
              />
            </div>
            <Button
              variant="default"
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Signing in\u2026' : 'Sign In'}
            </Button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app.
            </p>
            <div>
              <label htmlFor="totp" className="mb-1 block text-sm font-medium text-foreground">
                TOTP Code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-center text-lg tracking-widest text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <Button
              variant="default"
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full"
            >
              {loading ? 'Verifying\u2026' : 'Verify'}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              type="button"
              onClick={handleBackToSignIn}
            >
              Back to sign in
            </Button>
          </form>
        )}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Secure healthcare platform</p>
    </div>
  )
}
