'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { reportAdminAuthEvent } from '@/lib/trpc'

type Factor = {
  id: string
  factor_type: string
  status: string
  friendly_name?: string
  created_at?: string
}

export default function SettingsPage() {
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    loadFactors()
  }, [])

  async function loadFactors() {
    setLoading(true)
    try {
      const { data, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) {
        setError('Failed to load MFA factors')
        return
      }
      setFactors(
        (data.all ?? []).filter((f) => f.factor_type === 'webauthn') as Factor[],
      )
    } catch {
      setError('Failed to load MFA factors')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnroll() {
    setError(null)
    setSuccess(null)
    setEnrolling(true)

    try {
      if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
        setError('WebAuthn is not supported in this browser. Use a modern browser with FIDO2 support.')
        setEnrolling(false)
        return
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'webauthn',
      })

      if (enrollError) {
        setError(`Enrollment failed: ${enrollError.message}`)
        setEnrolling(false)
        return
      }

      // Challenge and verify the newly enrolled factor
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: data.id })

      if (challengeError) {
        setError('Failed to initiate verification challenge')
        setEnrolling(false)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: data.id,
        challengeId: challenge.id,
        code: '',
      })

      if (verifyError) {
        setError('Key verification failed. Please try again.')
        setEnrolling(false)
        return
      }

      reportAdminAuthEvent('ADMIN_MFA_ENROLLED', { factorId: data.id })
      setSuccess('Security key enrolled successfully.')
      await loadFactors()
    } catch {
      setError('An unexpected error occurred during enrollment')
    } finally {
      setEnrolling(false)
    }
  }

  async function handleUnenroll(factorId: string) {
    setError(null)
    setSuccess(null)

    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      })

      if (unenrollError) {
        setError(`Failed to remove key: ${unenrollError.message}`)
        return
      }

      reportAdminAuthEvent('ADMIN_MFA_UNENROLLED', { factorId })
      setSuccess('Security key removed.')
      await loadFactors()
    } catch {
      setError('An unexpected error occurred')
    }
  }

  const verifiedFactors = factors.filter((f) => f.status === 'verified')

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-4xl font-bold tracking-tight wavy-divider">Settings</h1>
      <p className="mt-4 text-text-muted">Manage your account security settings.</p>

      <section className="mt-8">
        <div className="rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Security Keys (FIDO2)</h2>
          <p className="mt-2 text-text-muted text-sm">
            Register a hardware security key (e.g., YubiKey) to add an extra layer of protection to your account.
            Once enrolled, you will be prompted for your key on every sign-in.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {success && (
            <div role="status" className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {success}
            </div>
          )}

          {loading ? (
            <p className="mt-4 text-sm text-text-muted">Loading...</p>
          ) : (
            <>
              {verifiedFactors.length > 0 && (
                <div className="mt-4 space-y-3">
                  {verifiedFactors.map((factor) => (
                    <div
                      key={factor.id}
                      className="flex items-center justify-between rounded-xl bg-surface px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <KeyIcon className="h-5 w-5 text-text-muted" />
                        <div>
                          <p className="text-sm font-medium text-black">
                            {factor.friendly_name || 'Security Key'}
                          </p>
                          {factor.created_at && (
                            <p className="text-xs text-text-muted">
                              Added {new Date(factor.created_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnenroll(factor.id)}
                        className="rounded-full text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {verifiedFactors.length === 0 && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No security key enrolled. We recommend adding one for stronger account protection.
                </div>
              )}

              <button
                type="button"
                onClick={handleEnroll}
                disabled={enrolling}
                className="mt-4 rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                {enrolling ? 'Waiting for key...' : 'Register New Security Key'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A.75.75 0 0 1 9.178 14H8v1.25a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V14H3.75a.75.75 0 0 1-.75-.75v-1.428a.75.75 0 0 1 .22-.53l4.084-4.084A5.01 5.01 0 0 1 8 7Zm5-3a.75.75 0 0 0 0 1.5A1.5 1.5 0 0 1 14.5 7 .75.75 0 0 0 16 7a3 3 0 0 0-3-3Z" clipRule="evenodd" />
    </svg>
  )
}
