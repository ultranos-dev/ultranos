'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { trpc, setAccessToken } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { OrgDetailsStep, type OrgDetailsData } from '@/components/registration/OrgDetailsStep'
import {
  AdminCredentialsStep,
  type AdminCredentialsData,
} from '@/components/registration/AdminCredentialsStep'
import { ModuleSelectionStep } from '@/components/registration/ModuleSelectionStep'

type Step = 1 | 2 | 3

/**
 * Admin Portal Self-Registration Page (Story 27.6 Task 3)
 *
 * Multi-step form:
 * 1. Organization details (name, country, billing email)
 * 2. Admin credentials (name, email, password)
 * 3. Module selection (at least one required)
 *
 * Flow on submit:
 * - Call registerOrganization (public endpoint)
 * - Auto-login via Supabase signInWithPassword
 * - Call selectInitialModules (authenticated)
 * - Redirect to dashboard with welcome toast
 */
export default function RegisterPage() {
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [orgData, setOrgData] = useState<OrgDetailsData>({
    orgName: '',
    countryCode: '',
    billingEmail: '',
  })

  const [credentialsData, setCredentialsData] = useState<AdminCredentialsData>({
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  })

  const [selectedModules, setSelectedModules] = useState<string[]>([])

  async function handleFinalSubmit() {
    setLoading(true)
    setError(null)

    try {
      // Step 1: Register organization + admin user (public endpoint)
      const registrationResult = await trpc.registration.registerOrganization.mutate({
        orgName: orgData.orgName.trim(),
        countryCode: orgData.countryCode,
        billingEmail: orgData.billingEmail.trim(),
        adminName: credentialsData.adminName.trim(),
        adminEmail: credentialsData.adminEmail.trim(),
        adminPassword: credentialsData.adminPassword,
      })

      if (!registrationResult.success) {
        setError('Registration failed — please try again or contact support')
        setLoading(false)
        return
      }

      // Step 2: Auto-login via Supabase Auth
      const supabase = getSupabaseBrowserClient()
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: credentialsData.adminEmail.trim(),
        password: credentialsData.adminPassword,
      })

      if (signInError || !signInData.session) {
        setError('Account created but auto-login failed. Please sign in manually.')
        setLoading(false)
        setTimeout(() => {
          window.location.href = '/login'
        }, 3000)
        return
      }

      // Store access token in memory for future tRPC calls
      const accessToken = signInData.session.access_token
      setAccessToken(accessToken)

      // Step 3: Select initial modules — use direct fetch to guarantee the token
      // is sent (tRPC httpBatchLink has module-singleton timing issues in Next.js)
      const hubUrl = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3007/api/trpc'
      const selectRes = await fetch(`${hubUrl}/registration.selectInitialModules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ json: { orgId: registrationResult.orgId, moduleCodes: selectedModules } }),
      })

      if (!selectRes.ok) {
        const errBody = await selectRes.json().catch(() => null)
        const msg = errBody?.error?.json?.message ?? 'Failed to select modules'
        throw new Error(msg)
      }

      // Populate auth session store from JWT
      const jwt = signInData.session.access_token
      const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64))

      useAuthSessionStore.getState().setSession({
        userId: payload.sub,
        practitionerId: payload.practitioner_id ?? payload.sub,
        role: 'ADMIN',
        sessionId: payload.session_id ?? '',
        email: signInData.session.user?.email ?? '',
      })

      // Redirect to dashboard with welcome parameter
      window.location.href = '/dashboard?welcome=true'
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Registration failed — please try again or contact support'
      setError(message)
      setLoading(false)
    }
  }

  const stepLabels = ['Organization', 'Admin Account', 'Modules']

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl">
        <h1 className="mb-2 text-center text-xl font-bold text-text-primary">
          Register Your Organization
        </h1>
        <p className="mb-6 text-center text-sm text-text-secondary">
          Get started with a 30-day free trial
        </p>

        {/* Progress indicator */}
        <div className="mb-6 flex items-center justify-between">
          {stepLabels.map((label, i) => {
            const stepNum = (i + 1) as Step
            const isActive = step === stepNum
            const isComplete = step > stepNum
            return (
              <div key={label} className="flex flex-1 flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                    isActive
                      ? 'bg-sidebar text-text-on-dark'
                      : isComplete
                        ? 'bg-accent text-text-primary'
                        : 'bg-surface text-text-secondary'
                  }`}
                >
                  {isComplete ? '\u2713' : stepNum}
                </div>
                <span className="mt-1 text-xs text-text-secondary">{label}</span>
              </div>
            )
          })}
        </div>

        {/* Global error */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {/* Step content */}
        {step === 1 && (
          <OrgDetailsStep
            data={orgData}
            onChange={setOrgData}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <AdminCredentialsStep
            data={credentialsData}
            onChange={setCredentialsData}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <ModuleSelectionStep
            selectedModules={selectedModules}
            onChange={setSelectedModules}
            onSubmit={handleFinalSubmit}
            onBack={() => setStep(2)}
            loading={loading}
          />
        )}

        {/* Sign-in link */}
        <p className="mt-6 text-center text-xs text-text-secondary">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-text-primary hover:text-accent transition-colors duration-200">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
