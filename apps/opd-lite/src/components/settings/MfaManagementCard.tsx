'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'

export function MfaManagementCard() {
  const t = useTranslations('settings')
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null)
  const [existingFactorId, setExistingFactorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmingCode, setConfirmingCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  // Reactive online/offline detection
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
    async function checkMfa() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.mfa.listFactors()
        if (active) {
          const verifiedFactors = (data?.totp ?? []).filter(
            (f: { status: string }) => f.status === 'verified'
          )
          setIsEnrolled(verifiedFactors.length > 0)
          setExistingFactorId(verifiedFactors[0]?.id ?? null)
        }
      } catch {
        // Best-effort — don't block settings page
      } finally {
        if (active) setLoading(false)
      }
    }
    checkMfa()
    return () => { active = false }
  }, [isOnline])

  // Step 1: Verify current TOTP before allowing reconfigure
  const handleStartReconfigure = useCallback(() => {
    setError(null)
    setConfirming(true)
    setConfirmingCode('')
  }, [])

  const handleConfirmCurrentTotp = useCallback(async () => {
    if (!existingFactorId || !confirmingCode) return
    setError(null)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: existingFactorId,
      })
      if (challengeErr || !challenge) {
        if (activeRef.current) setError(t('failedMfaChallenge'))
        return
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: existingFactorId,
        challengeId: challenge.id,
        code: confirmingCode,
      })
      if (verifyErr) {
        if (activeRef.current) setError(t('incorrectTotp'))
        return
      }
      if (!activeRef.current) return
      // Verified — proceed to enrollment
      setConfirming(false)
      setConfirmingCode('')
      await startEnrollment()
    } catch {
      if (activeRef.current) setError(t('verificationError'))
    }
  }, [existingFactorId, confirmingCode])

  // Step 2: Enroll new TOTP factor
  const startEnrollment = useCallback(async () => {
    setError(null)
    setEnrolling(true)
    try {
      const supabase = getSupabaseBrowserClient()
      // Unenroll existing factor before enrolling new one
      if (existingFactorId) {
        await supabase.auth.mfa.unenroll({ factorId: existingFactorId })
      }
      const { data: factor, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      })
      if (!activeRef.current) return
      if (enrollError) {
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
  }, [existingFactorId])

  const handleVerify = useCallback(async () => {
    if (!factorId || !verifyCode) return
    setError(null)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error: challengeError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verifyCode,
      })
      if (!activeRef.current) return
      if (challengeError) {
        setError(t('verificationFailed'))
        return
      }
      setIsEnrolled(true)
      setExistingFactorId(factorId)
      setEnrolling(false)
      setQrCode(null)
      setFactorId(null)
      setVerifyCode('')
    } catch {
      if (activeRef.current) setError(t('verificationError'))
    }
  }, [factorId, verifyCode])

  const handleCancel = useCallback(async () => {
    // Unenroll the dangling unverified factor
    if (factorId) {
      try {
        const supabase = getSupabaseBrowserClient()
        await supabase.auth.mfa.unenroll({ factorId })
      } catch {
        // Best-effort cleanup
      }
    }
    setConfirming(false)
    setConfirmingCode('')
    setEnrolling(false)
    setQrCode(null)
    setFactorId(null)
    setVerifyCode('')
    setError(null)
  }, [factorId])

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-foreground">{t('mfaManagement')}</h2>

      {!isOnline && (
        <p className="mb-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          {t('mfaOffline')}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">{t('mfaLoading')}</p>}

      {!loading && isEnrolled !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('totpStatus')}</p>
            {isEnrolled ? (
              <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
                {t('totpEnrolled')}
              </span>
            ) : (
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                {t('totpNotEnrolled')}
              </span>
            )}
          </div>

          {!confirming && !enrolling && isOnline && (
            <Button
              variant="primary"
              onClick={isEnrolled ? handleStartReconfigure : startEnrollment}
              aria-label={isEnrolled ? t('reconfigureTotp') : t('enrollTotp')}
            >
              {isEnrolled ? t('reconfigureTotp') : t('enrollTotp')}
            </Button>
          )}

          {confirming && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('confirmReconfigurePrompt')}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={confirmingCode}
                  onChange={(e) => setConfirmingCode(e.target.value)}
                  placeholder={t('currentTotpPlaceholder')}
                  className="rounded-xl border border-border px-3 py-1.5 text-sm"
                  maxLength={6}
                  aria-label={t('currentTotpAriaLabel')}
                />
                <Button variant="primary" disabled={confirmingCode.length < 6} onClick={handleConfirmCurrentTotp}>
                  {t('confirm')}
                </Button>
                <Button variant="secondary" onClick={handleCancel}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}

          {enrolling && qrCode && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('scanQrPrompt')}
              </p>
              <img src={qrCode} alt={t('totpQrAlt')} className="h-48 w-48" />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder={t('enterCodePlaceholder')}
                  className="rounded-xl border border-border px-3 py-1.5 text-sm"
                  maxLength={6}
                  aria-label={t('totpVerifyAriaLabel')}
                />
                <Button variant="primary" disabled={verifyCode.length < 6} onClick={handleVerify}>
                  {t('verify')}
                </Button>
                <Button variant="secondary" onClick={handleCancel}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      )}
    </Card>
  )
}
