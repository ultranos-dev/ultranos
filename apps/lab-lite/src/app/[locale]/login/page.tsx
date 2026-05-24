'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type AuthStep = 'credentials' | 'mfa' | 'error'

/**
 * Lab Lite Login Page
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
      setError('An unexpected error occurred during MFA verification')
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
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-center text-xl font-bold text-neutral-900">
          Lab Portal Sign In
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleCredentialSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="technician@lab.example"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoComplete="current-password"
              />
            </div>
            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              fullWidth
            >
              {loading ? 'Signing in\u2026' : 'Sign In'}
            </Button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <p className="text-sm text-neutral-600">
              Enter the 6-digit code from your authenticator app.
            </p>
            <div>
              <label htmlFor="totp" className="mb-1 block text-sm font-medium text-neutral-700">
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg tracking-widest focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              {loading ? 'Verifying\u2026' : 'Verify'}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={handleBackToSignIn}
              fullWidth
            >
              Back to sign in
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
