'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { X } from '@ultranos/ui-kit/icons'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAuthEvent } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { deriveSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore, getOrCreateDeviceSalt } from '@/lib/encryption-key-store'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'

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
        reportAuthEvent('LOGIN_FAILURE', { actorEmail: email })
        setError(t('errorInvalidCredentials'))
        setLoading(false)
        return
      }

      reportAuthEvent('LOGIN_SUCCESS', { actorId: data.user?.id })
      setPassword('')

      // TODO: MFA temporarily disabled — re-enable before production
      await populateSessionAndRedirect()
    } catch {
      setError(t('errorUnexpected'))
    } finally {
      setLoading(false)
    }
  }

  async function populateSessionAndRedirect() {
    const { data: sessionData } = await supabase.auth.getSession()
    const jwt = sessionData.session?.access_token
    if (!jwt) {
      setError(t('errorSessionMfa'))
      setLoading(false)
      return
    }

    const base64 = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
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
      kycStatus: payload.kyc_status ?? payload.app_metadata?.kyc_status,
    })

    if (!encryptionKeyStore.isReady()) {
      // Derive the SAME deterministic key AuthGuard re-derives on refresh
      // (PBKDF2 over the Supabase user id + device salt). Using a random key
      // here left data written this session undecryptable after a reload —
      // AuthGuard would then wipe and re-pull it. payload.sub === session.user.id,
      // so this matches AuthGuard's deriveSessionKey(data.session.user.id, …) input.
      const derivedKey = await deriveSessionKey(payload.sub, getOrCreateDeviceSalt())
      encryptionKeyStore.setKey(derivedKey)
    }

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
        setError(t('errorInvalidTotp'))
        setTotpCode('')
        setLoading(false)
        return
      }

      reportAuthEvent('MFA_VERIFY_SUCCESS')
      await populateSessionAndRedirect()
    } catch {
      setError(t('errorUnexpectedMfa'))
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
    <div className="space-y-6">
      {showResetBanner && (
        <Alert variant="success">
          <div className="flex items-center justify-between gap-2">
            <span>{t('resetSuccess')}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss"
              onClick={() => {
                setShowResetBanner(false)
                router.replace('/login')
              }}
              className="-me-1 shrink-0"
            >
              <X className="size-4" />
            </Button>
          </div>
        </Alert>
      )}
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {step === 'credentials' ? t('signIn') : t('mfaTitle')}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {step === 'credentials' ? t('signInSubtitle') : t('totpInstruction')}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
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
              placeholder="clinician@hospital.example"
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
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <div className="space-y-2">
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
            type="submit"
            className="w-full"
            disabled={loading || totpCode.length !== 6}
          >
            {loading ? t('verifying') : t('verify')}
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
    </div>
  )
}
