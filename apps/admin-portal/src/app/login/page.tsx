'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

type AuthStep = 'credentials' | 'mfa'

/**
 * Admin Portal Login Page
 * Story 22.1: Admins authenticate via email + password + FIDO2 hardware token MFA.
 * No TOTP fallback — hardware security keys required per PRD Section 9.
 *
 * Flow:
 * 1. Email + password credentials
 * 2. Check for WebAuthn factor — reject if no FIDO2 enrolled
 * 3. FIDO2 MFA challenge (hardware key tap)
 * 4. Populate auth session store, redirect to /dashboard
 */
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
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorEmail: email })
        setError('Invalid email or password')
        setLoading(false)
        return
      }

      // Clear password from state after successful credential auth
      setPassword('')

      // Check for WebAuthn (FIDO2) factor — no TOTP fallback for admins
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors()

      if (factorsError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      // Find a WebAuthn/FIDO2 factor (phone type is used for WebAuthn in Supabase)
      const webauthnFactor = factors.all?.find(
        (f) => f.factor_type === 'webauthn' && f.status === 'verified',
      )

      if (!webauthnFactor) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError(
          'Hardware security key (FIDO2) is required for admin access. Contact IT.',
        )
        setLoading(false)
        return
      }

      // Create FIDO2 MFA challenge
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

      // Supabase SDK handles the WebAuthn browser credential prompt internally
      // when verify is called on a webauthn factor type.
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

      // Populate auth session store from JWT claims
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
      })

      reportAdminAuthEvent('ADMIN_LOGIN_SUCCESS', { actorId: payload.sub })

      // Redirect to returnUrl (from AuthGuard) or dashboard
      const params = new URLSearchParams(window.location.search)
      const returnUrl = params.get('returnUrl')
      window.location.href = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard'
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-center text-xl font-bold text-neutral-900">
          Admin Portal Sign In
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
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="admin@hospital.example"
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
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Signing in\u2026' : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <div className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-medium">Hardware Security Key Required</p>
              <p className="mt-1">
                Please tap your FIDO2 security key when prompted by your browser.
              </p>
            </div>
            <button
              type="button"
              onClick={handleMfaVerify}
              disabled={loading}
              className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Verifying\u2026' : 'Verify Security Key'}
            </button>
            <button
              type="button"
              onClick={handleBackToSignIn}
              className="w-full text-sm text-neutral-500 hover:text-neutral-700"
            >
              Back to sign in
            </button>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-neutral-500">
          New to Ultranos?{' '}
          <a href="/register" className="font-medium text-primary-600 hover:text-primary-700">
            Register your organization
          </a>
        </p>
      </div>
    </div>
  )
}
