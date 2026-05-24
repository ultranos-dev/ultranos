'use client'

import { useState, useEffect } from 'react'
import { verifyPatient, type VerifyPatientResult } from '@/lib/trpc'
import { cacheVerifiedPatient, getCachedPatient } from '@/lib/offline-verify'
import { Button } from '@/components/ui/Button'
import { OfflineVerificationBadge } from './OfflineVerificationBadge'
import { OnlineStatusIndicator } from './OnlineStatusIndicator'

type VerificationSource = 'online' | 'cached'

interface PatientVerifyFormProps {
  onVerified: (result: VerifyPatientResult) => void
  onError: (message: string) => void
  token: string
}

/**
 * Manual patient identity verification via National ID input.
 * Displays a verification card with first name + age only (data minimization).
 * "Confirm Patient" proceeds to upload workflow with opaque patientRef.
 *
 * When offline: checks Dexie patient cache (< 24h old) for matching entries.
 * When online: verifies via Hub API and caches the result.
 *
 * Story 12.2 — AC 2, 5
 */
export function PatientVerifyForm({ onVerified, onError, token }: PatientVerifyFormProps) {
  const [nationalId, setNationalId] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifiedResult, setVerifiedResult] = useState<VerifyPatientResult | null>(null)
  const [verificationSource, setVerificationSource] = useState<VerificationSource>('online')
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = nationalId.trim()
    if (!trimmed) return

    setLoading(true)
    setVerifiedResult(null)

    try {
      if (!isOnline) {
        // Offline path: check Dexie cache using the national ID as patient ID
        const cached = await getCachedPatient(trimmed)
        if (cached) {
          setVerifiedResult({
            firstName: cached.firstName,
            age: cached.age,
            patientRef: trimmed,
          })
          setVerificationSource('cached')
        } else {
          onError('Use QR scan or retry when connected')
        }
      } else {
        // Online path: verify via Hub API
        const result = await verifyPatient(trimmed, 'NATIONAL_ID', token)
        setVerifiedResult(result)
        setVerificationSource('online')

        // Cache for future offline use (Rule #7: firstName + age only)
        await cacheVerifiedPatient(result.patientRef, result.firstName, result.age)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Patient verification failed')
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    if (verifiedResult) {
      onVerified(verifiedResult)
    }
  }

  function handleReset() {
    setVerifiedResult(null)
    setVerificationSource('online')
    setNationalId('')
  }

  return (
    <div className="flex flex-col gap-4">
      <OnlineStatusIndicator />

      {/* National ID input */}
      {!verifiedResult && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="national-id" className="text-sm font-medium text-neutral-700">
            National ID
          </label>
          <input
            id="national-id"
            type="text"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder={isOnline ? 'Enter patient National ID' : 'Enter cached patient ID'}
            disabled={loading}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoComplete="off"
          />
          {!isOnline && (
            <p className="text-xs text-amber-600">
              Offline — only cached patients can be verified. Use QR scan for signature-based
              verification.
            </p>
          )}
          <Button
            variant="primary"
            type="submit"
            disabled={loading || !nationalId.trim()}
          >
            {loading ? 'Verifying...' : isOnline ? 'Look Up Patient' : 'Check Cache'}
          </Button>
        </form>
      )}

      {/* Verification card — first name + age ONLY */}
      {verifiedResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-green-800">Patient Verified</h3>
            <OfflineVerificationBadge source={verificationSource} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="font-medium text-neutral-600">First Name</dt>
            <dd className="text-neutral-900">{verifiedResult.firstName}</dd>
            <dt className="font-medium text-neutral-600">Age</dt>
            <dd className="text-neutral-900">{verifiedResult.age}</dd>
          </dl>
          <div className="mt-4 flex gap-3">
            <Button
              variant="primary"
              className="flex-1"
              type="button"
              onClick={handleConfirm}
            >
              Confirm Patient
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={handleReset}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
