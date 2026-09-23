'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound } from '@ultranos/ui-kit/icons'

/**
 * Story 56.3 — real Supabase TOTP enrollment (Admin Portal), replacing the former
 * empty-code WebAuthn ceremony. Enrollment is available regardless of the org MFA
 * toggle (an admin may pre-enroll), but it is only ENFORCED at login/Hub when the
 * org policy requires it. Enrolled factors persist across toggle changes, so
 * disabling then re-enabling MFA never forces re-enrollment.
 */

const CARD = 'rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50'
const CARD_TITLE = 'text-sm font-semibold text-foreground uppercase tracking-wide'

type Factor = { id: string; factor_type: string; status: string; friendly_name?: string; created_at?: string }

export function TotpEnrollmentCard() {
  const t = useTranslations('settings')
  const supabase = getSupabaseBrowserClient()

  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // In-progress enrollment state
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors()
      if (err) {
        setError(t('mfaLoadError'))
        return
      }
      // Only TOTP factors are managed here (Story 56.3 is TOTP-first).
      setFactors((data.totp ?? []) as Factor[])
    } catch {
      setError(t('mfaLoadError'))
    } finally {
      setLoading(false)
    }
  }

  async function beginEnroll() {
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (err || !data) {
        setError(t('mfaEnrollError'))
        return
      }
      setEnrollFactorId(data.id)
      setQrCode(data.totp?.qr_code ?? null)
      setSecret(data.totp?.secret ?? null)
    } catch {
      setError(t('mfaEnrollError'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollFactorId) return
    setError(null)
    setBusy(true)
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrollFactorId })
      if (chErr || !challenge) {
        setError(t('mfaChallengeError'))
        return
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code,
      })
      if (vErr) {
        setError(t('mfaInvalidCode'))
        setCode('')
        return
      }
      reportAdminAuthEvent('ADMIN_MFA_ENROLLED', { factorId: enrollFactorId })
      resetEnrollState()
      setSuccess(t('mfaEnrollSuccess'))
      await load()
    } catch {
      setError(t('mfaEnrollError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleUnenroll(factorId: string) {
    setError(null)
    setSuccess(null)
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
      if (err) {
        setError(t('mfaUnenrollError'))
        return
      }
      reportAdminAuthEvent('ADMIN_MFA_UNENROLLED', { factorId })
      setSuccess(t('mfaUnenrollSuccess'))
      await load()
    } catch {
      setError(t('mfaUnenrollError'))
    }
  }

  function resetEnrollState() {
    setEnrollFactorId(null)
    setQrCode(null)
    setSecret(null)
    setCode('')
  }

  const verified = factors.filter((f) => f.status === 'verified')

  return (
    <div className={CARD}>
      <div className="space-y-4">
        <h2 className={CARD_TITLE}>{t('mfaEnrollTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('mfaEnrollDescription')}</p>

        {error && (
          <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
            {success}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('mfaLoading')}</p>
        ) : enrollFactorId ? (
          <form onSubmit={confirmEnroll} className="space-y-4">
            {qrCode && (
              // Supabase returns the QR as an SVG data URI. Scan with any TOTP app.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCode} alt={t('mfaQrAlt')} className="h-44 w-44 rounded-xl border border-border bg-white p-2" />
            )}
            {secret && (
              <p className="break-all text-xs text-muted-foreground">
                {t('mfaSecretLabel')}: <span className="font-mono">{secret}</span>
              </p>
            )}
            <p className="text-sm text-muted-foreground">{t('mfaScanPrompt')}</p>
            <div className="space-y-2">
              <Label htmlFor="totp-enroll">{t('mfaCodeLabel')}</Label>
              <Input
                id="totp-enroll"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length < 6}>
                {busy ? t('mfaVerifying') : t('mfaConfirmEnroll')}
              </Button>
              <Button type="button" variant="ghost" onClick={resetEnrollState} disabled={busy}>
                {t('mfaCancel')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            {verified.length > 0 ? (
              <div className="space-y-3">
                {verified.map((factor) => (
                  <div key={factor.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-foreground">{factor.friendly_name || t('mfaAuthenticatorApp')}</p>
                        {factor.created_at && (
                          <p className="text-xs text-muted-foreground">
                            {t('mfaAddedOn', { date: new Date(factor.created_at).toLocaleDateString() })}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnenroll(factor.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      {t('mfaRemove')}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                {t('mfaNoFactors')}
              </div>
            )}
            <Button type="button" onClick={beginEnroll} disabled={busy}>
              {busy ? t('mfaVerifying') : t('mfaAddFactor')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
