'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { ROLE_MODULE_MAP, MODULE_DISPLAY_NAMES } from '@ultranos/shared-types'

interface AvailableRole {
  role: string
  moduleCode: string | null
  moduleName: string | null
}

interface UnavailableRole {
  role: string
  moduleCode: string
  moduleName: string
  reason: 'NOT_SUBSCRIBED'
}

export default function CreateUserPage() {
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [unavailableRoles, setUnavailableRoles] = useState<UnavailableRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    async function fetchRoles() {
      try {
        setLoading(true)
        const result = await trpc.subscription.getAvailableRoles.query()
        setAvailableRoles(result.availableRoles)
        setUnavailableRoles(result.unavailableRoles)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load available roles')
      } finally {
        setLoading(false)
      }
    }
    fetchRoles()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(false)

    // Client-side guard: prevent submission of unavailable role
    const isAvailable = availableRoles.some((r) => r.role === selectedRole)
    if (!isAvailable) {
      setSubmitError('Selected role is not available for your subscription.')
      return
    }

    // Server-side validation before creating user
    try {
      setSubmitting(true)
      const validation = await trpc.subscription.validateRoleForOrg.query({ role: selectedRole })
      if (!validation.allowed) {
        setSubmitError(validation.reason ?? 'Role not permitted for your subscription.')
        return
      }

      // TODO: Call user creation endpoint when Epic 22 user management is implemented.
      // For now, validation passes — the form is ready for integration.
      setSubmitSuccess(true)
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to validate role')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-neutral-500">Loading available roles...</div>
  }

  if (error) {
    return <div className="text-red-600">Error: {error}</div>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Create Staff User</h1>
      <p className="mt-2 text-neutral-500">
        Assign roles based on your organization&apos;s active module subscriptions.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* Role Selector — AC #1, #2 */}
        <div>
          <label className="block text-sm font-medium text-neutral-700">Role</label>
          <div className="mt-2 space-y-2">
            {/* Available roles — selectable */}
            {availableRoles.map((r) => (
              <label
                key={r.role}
                className="flex items-center gap-3 rounded-md border border-neutral-200 px-4 py-3 cursor-pointer hover:bg-neutral-50 transition-colors has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50"
              >
                <input
                  type="radio"
                  name="role"
                  value={r.role}
                  checked={selectedRole === r.role}
                  onChange={() => setSelectedRole(r.role)}
                  className="text-primary-600"
                />
                <div>
                  <span className="font-medium text-sm">{r.role}</span>
                  {r.moduleName && (
                    <span className="ms-2 text-xs text-neutral-500">({r.moduleName})</span>
                  )}
                </div>
              </label>
            ))}

            {/* Unavailable roles — disabled with subscription prompt (AC #2) */}
            {unavailableRoles.map((r) => (
              <div
                key={r.role}
                className="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 opacity-60"
              >
                <input type="radio" name="role" disabled className="text-neutral-300" />
                <div>
                  <span className="font-medium text-sm text-neutral-400">{r.role}</span>
                  <span className="ms-2 text-xs text-neutral-400">
                    &mdash;{' '}
                    <a
                      href="/subscriptions"
                      className="text-primary-600 hover:underline"
                    >
                      Subscribe to {r.moduleName} to add {r.role} users
                    </a>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submission */}
        {submitError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {submitSuccess && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Role validated successfully. User creation will be available when user management is fully implemented.
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || !selectedRole || !name || !email}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Validating...' : 'Create User'}
          </button>
          <a
            href="/users"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
