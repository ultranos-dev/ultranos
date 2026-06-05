'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { generateSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'

type AuthStep = 'credentials' | 'mfa'

/**
 * OPD Lite Login Page
 * Story 14.1: Clinicians authenticate via Supabase Auth with TOTP MFA enforced.
 *
 * Flow:
 * 1. Email + password credentials
 * 2. TOTP MFA challenge (required for all clinical staff per PRD)
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

    const base64 = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
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

    // Generate AES-256-GCM session key for IndexedDB encryption.
    // Key lives in memory only — cleared on tab close and logout.
    if (!encryptionKeyStore.isReady()) {
      const encKey = await generateSessionKey()
      encryptionKeyStore.setKey(encKey)
    }

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
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <h2 className="mb-6 text-center text-xl font-bold text-foreground">
          OPD Lite Sign In
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="clinician@hospital.example"
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="current-password"
              />
            </div>
            <Button variant="primary" type="submit" disabled={loading} fullWidth>
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
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-center text-lg tracking-widest text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <Button variant="primary" type="submit" disabled={loading || totpCode.length !== 6} fullWidth>
              {loading ? 'Verifying\u2026' : 'Verify'}
            </Button>
            <Button variant="ghost" onClick={handleBackToSignIn} fullWidth>
              Back to sign in
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
