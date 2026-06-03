'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AuthStep = 'credentials' | 'mfa'

/**
 * Admin Portal Login Page
 * Admins authenticate via email + password, with optional FIDO2 hardware token MFA.
 * If a security key is enrolled (via Settings), it is required at sign-in.
 *
 * Flow:
 * 1. Email + password credentials
 * 2. Check for WebAuthn factor — if enrolled, require FIDO2 challenge
 * 3. If no key enrolled, sign in directly
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

      // Check for WebAuthn (FIDO2) factor — if enrolled, require it
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors()

      if (factorsError) {
        reportAdminAuthEvent('ADMIN_LOGIN_FAILURE', { actorId: data.user?.id })
        await supabase.auth.signOut()
        setError('Failed to retrieve MFA factors')
        setLoading(false)
        return
      }

      // Find a verified WebAuthn/FIDO2 factor
      const webauthnFactor = factors.all?.find(
        (f) => f.factor_type === 'webauthn' && f.status === 'verified',
      )

      if (!webauthnFactor) {
        // No FIDO2 key enrolled — allow login without MFA
        // Admin can enroll a key later via Settings
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
        })

        reportAdminAuthEvent('ADMIN_LOGIN_SUCCESS', { actorId: payload.sub })

        const params = new URLSearchParams(window.location.search)
        const returnUrl = params.get('returnUrl')
        window.location.href = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard'
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-2xl bg-popover p-6 shadow-xl">
        <h2 className="mb-6 text-center text-xl font-bold text-foreground">
          Admin Portal Sign In
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleCredentialSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="mb-1 text-muted-foreground">
                Email
              </Label>
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
            <div>
              <Label htmlFor="password" className="mb-1 text-muted-foreground">
                Password
              </Label>
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
              {loading ? 'Signing in\u2026' : 'Sign In'}
            </Button>
          </form>
        )}

        {step === 'mfa' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
              <p className="font-medium">Hardware Security Key Required</p>
              <p className="mt-1">
                Please tap your FIDO2 security key when prompted by your browser.
              </p>
            </div>
            <Button type="button" onClick={handleMfaVerify} disabled={loading} className="w-full">
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
        <p className="mt-6 text-center text-xs text-muted-foreground">
          New to Ultranos?{' '}
          <a href="/register" className="font-medium text-foreground hover:text-primary transition-colors duration-200">
            Register your organization
          </a>
        </p>
      </div>
    </div>
  )
}
