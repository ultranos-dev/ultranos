'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

/**
 * Story 56.3 — TOTP enrollment for Pharmacy-Lite settings.
 *
 * Lets a pharmacist enroll an authenticator app (TOTP) as a second factor. The
 * factor is only ENFORCED at login/Hub when the org enabled MFA; enrolling here is
 * always allowed so staff can prepare ahead of a rollout. Offline-aware: enrollment
 * needs the network, so it is disabled offline (an already-enrolled aal2 session
 * keeps working offline — enforcement is at Hub-call time, not the local store).
 */
export function MfaEnrollmentCard() {
  const t = useTranslations('settings')
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (!isOnline) {
      setLoading(false)
      return
    }
    let active = true
    async function check() {
      try {
        const { data } = await getSupabaseBrowserClient().auth.mfa.listFactors()
        if (!active) return
        const verified = (data?.totp ?? []).filter((f: { status: string }) => f.status === 'verified')
        setIsEnrolled(verified.length > 0)
      } catch {
        // Best-effort; do not block settings.
      } finally {
        if (active) setLoading(false)
      }
    }
    void check()
    return () => {
      active = false
    }
  }, [isOnline])

  const startEnrollment = useCallback(async () => {
    setError(null)
    setEnrolling(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: factor, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (!activeRef.current) return
      if (enrollError || !factor) {
        setError(t('failedEnrollment'))
        setEnrolling(false)
        return
      }
      setQrCode(factor.totp.qr_code)
      setFactorId(factor.id)
    } catch {
      if (activeRef.current) {
        setError(t('failedEnrollment'))
        setEnrolling(false)
      }
    }
  }, [t])

  const handleVerify = useCallback(async () => {
    if (!factorId || !verifyCode) return
    setError(null)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: verifyCode })
      if (!activeRef.current) return
      if (verifyError) {
        setError(t('verificationFailed'))
        return
      }
      setIsEnrolled(true)
      setEnrolling(false)
      setQrCode(null)
      setFactorId(null)
      setVerifyCode('')
    } catch {
      if (activeRef.current) setError(t('verificationError'))
    }
  }, [factorId, verifyCode, t])

  const handleCancel = useCallback(async () => {
    if (factorId) {
      try {
        await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId })
      } catch {
        // Best-effort cleanup of the unverified factor.
      }
    }
    setEnrolling(false)
    setQrCode(null)
    setFactorId(null)
    setVerifyCode('')
    setError(null)
  }, [factorId])

  return (
    <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50" aria-labelledby="mfa-enroll-heading">
      <h2 id="mfa-enroll-heading" className="mb-4 text-sm font-semibold text-foreground">{t('mfaStatus')}</h2>

      {!isOnline && (
        <p className="mb-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{t('mfaOffline')}</p>
      )}

      {loading && <p className="text-sm text-muted-foreground">{t('loadingMfa')}</p>}

      {!loading && isEnrolled !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('totpStatus')}</p>
            {isEnrolled ? (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success" data-testid="mfa-status">
                {t('totpEnabled')}
              </span>
            ) : (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning" data-testid="mfa-status">
                {t('totpNotConfigured')}
              </span>
            )}
          </div>

          {!enrolling && isOnline && !isEnrolled && (
            <Button variant="default" onClick={startEnrollment}>{t('enrollTotp')}</Button>
          )}

          {enrolling && qrCode && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('scanQrPrompt')}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt={t('totpQrAlt')} className="h-48 w-48 rounded-xl border border-border bg-white p-2" />
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="rounded-xl border border-border px-3 py-1.5 text-sm"
                  maxLength={6}
                  aria-label={t('totpVerifyAriaLabel')}
                />
                <Button variant="default" disabled={verifyCode.length < 6} onClick={handleVerify}>{t('verify')}</Button>
                <Button variant="secondary" onClick={handleCancel}>{t('cancel')}</Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </section>
  )
}
