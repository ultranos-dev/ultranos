'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export function MfaManagementCard() {
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
          const verifiedFactors = data.totp.filter(
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
        if (activeRef.current) setError('Failed to create MFA challenge')
        return
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: existingFactorId,
        challengeId: challenge.id,
        code: confirmingCode,
      })
      if (verifyErr) {
        if (activeRef.current) setError('Current TOTP code is incorrect')
        return
      }
      if (!activeRef.current) return
      // Verified — proceed to enrollment
      setConfirming(false)
      setConfirmingCode('')
      await startEnrollment()
    } catch {
      if (activeRef.current) setError('Verification failed')
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
        setError('Failed to start TOTP enrollment')
        setEnrolling(false)
        return
      }
      setQrCode(factor.totp.qr_code)
      setFactorId(factor.id)
    } catch {
      if (activeRef.current) {
        setError('Failed to start TOTP enrollment')
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
        setError('Verification failed — check your code')
        return
      }
      setIsEnrolled(true)
      setExistingFactorId(factorId)
      setEnrolling(false)
      setQrCode(null)
      setFactorId(null)
      setVerifyCode('')
    } catch {
      if (activeRef.current) setError('Verification failed')
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
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-neutral-900">MFA Management</h2>

      {!isOnline && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          MFA management requires an active connection. You are currently offline.
        </p>
      )}

      {loading && <p className="text-sm text-neutral-400">Loading MFA status...</p>}

      {!loading && isEnrolled !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-neutral-500">TOTP Status</p>
            {isEnrolled ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Enrolled
              </span>
            ) : (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Not Enrolled
              </span>
            )}
          </div>

          {!confirming && !enrolling && isOnline && (
            <button
              type="button"
              onClick={isEnrolled ? handleStartReconfigure : startEnrollment}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              aria-label={isEnrolled ? 'Reconfigure TOTP' : 'Enroll TOTP'}
            >
              {isEnrolled ? 'Reconfigure TOTP' : 'Enroll TOTP'}
            </button>
          )}

          {confirming && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-600">
                Enter your current TOTP code to confirm reconfiguration:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={confirmingCode}
                  onChange={(e) => setConfirmingCode(e.target.value)}
                  placeholder="Current 6-digit code"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  maxLength={6}
                  aria-label="Current TOTP code"
                />
                <button
                  type="button"
                  onClick={handleConfirmCurrentTotp}
                  disabled={confirmingCode.length < 6}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {enrolling && qrCode && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-600">
                Scan this QR code with your authenticator app:
              </p>
              <img src={qrCode} alt="TOTP QR Code" className="h-48 w-48" />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                  maxLength={6}
                  aria-label="TOTP verification code"
                />
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifyCode.length < 6}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
