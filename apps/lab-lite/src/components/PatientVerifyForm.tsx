'use client'

import { useState } from 'react'
import { verifyPatient, type VerifyPatientResult } from '@/lib/trpc'

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
 * Story 12.2 — AC 2, 5
 */
export function PatientVerifyForm({ onVerified, onError, token }: PatientVerifyFormProps) {
  const [nationalId, setNationalId] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifiedResult, setVerifiedResult] = useState<VerifyPatientResult | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = nationalId.trim()
    if (!trimmed) return

    setLoading(true)
    setVerifiedResult(null)

    try {
      const result = await verifyPatient(trimmed, 'NATIONAL_ID', token)
      setVerifiedResult(result)
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
    setNationalId('')
  }

  return (
    <div className="flex flex-col gap-4">
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
            placeholder="Enter patient National ID"
            disabled={loading}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading || !nationalId.trim()}
            className="rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Look Up Patient'}
          </button>
        </form>
      )}

      {/* Verification card — first name + age ONLY */}
      {verifiedResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-green-800">Patient Verified</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="font-medium text-neutral-600">First Name</dt>
            <dd className="text-neutral-900">{verifiedResult.firstName}</dd>
            <dt className="font-medium text-neutral-600">Age</dt>
            <dd className="text-neutral-900">{verifiedResult.age}</dd>
          </dl>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Confirm Patient
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
