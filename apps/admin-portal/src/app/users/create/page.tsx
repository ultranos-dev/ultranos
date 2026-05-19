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
  const [createdUser, setCreatedUser] = useState<{
    userId: string; name: string; email: string; role: string; setupLink: string | null; emailSent: boolean
  } | null>(null)

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

      const result = await trpc.admin.createUser.mutate({ name, email, role: selectedRole })
      setCreatedUser(result)
      setSubmitSuccess(true)
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to validate role')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-text-secondary">Loading available roles...</div>
  }

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-4xl font-bold tracking-tight">Create Staff User</h1>
      <p className="mt-4 text-text-secondary">
        Assign roles based on your organization&apos;s active module subscriptions.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="rounded-3xl bg-surface-raised p-5 border border-border space-y-6">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text-secondary">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-border px-4 py-2.5 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {/* Role Selector */}
          <div>
            <p className="text-sm font-medium text-text-secondary mb-2">Role</p>
            <div className="space-y-2">
              {/* Available roles — selectable */}
              {availableRoles.map((r) => (
                <label
                  key={r.role}
                  className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    selectedRole === r.role
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.role}
                    checked={selectedRole === r.role}
                    onChange={() => setSelectedRole(r.role)}
                    className="accent-accent"
                  />
                  <div>
                    <span className="font-medium text-sm text-text-primary">{r.role}</span>
                    {r.moduleName && (
                      <span className="ms-2 text-xs text-text-secondary">({r.moduleName})</span>
                    )}
                  </div>
                </label>
              ))}

              {/* Unavailable roles — disabled with subscription prompt */}
              {unavailableRoles.map((r) => (
                <div
                  key={r.role}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 opacity-60"
                >
                  <input type="radio" name="role" disabled className="accent-accent" />
                  <div>
                    <span className="font-medium text-sm text-text-secondary">{r.role}</span>
                    <span className="ms-2 text-xs text-text-secondary">
                      &mdash;{' '}
                      <a
                        href="/subscriptions"
                        className="text-accent hover:underline"
                      >
                        Subscribe to {r.moduleName} to add {r.role} users
                      </a>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submission feedback */}
        {submitError && (
          <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {submitSuccess && createdUser && (
          <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            <p className="font-semibold text-base mb-2">User created successfully</p>
            <p><span className="font-medium">Name:</span> {createdUser.name}</p>
            <p><span className="font-medium">Email:</span> {createdUser.email}</p>
            <p><span className="font-medium">Role:</span> {createdUser.role}</p>
            {createdUser.emailSent && (
              <p className="mt-2">An invitation email has been sent to {createdUser.email}.</p>
            )}
            {!createdUser.emailSent && createdUser.setupLink && (
              <div className="mt-2">
                <p>Email delivery is not configured. Share this setup link manually:</p>
                <code className="mt-1 block break-all rounded-lg bg-green-100 px-3 py-2 font-mono text-xs text-green-900">
                  {createdUser.setupLink}
                </code>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreatedUser(null)
                  setSubmitSuccess(false)
                  setName('')
                  setEmail('')
                  setSelectedRole('')
                  setSubmitError(null)
                }}
                className="rounded-full bg-accent text-text-primary font-semibold px-6 py-2.5 hover:bg-accent-hover hover:scale-[1.02] transition-all"
              >
                Create Another User
              </button>
              <a
                href="/users"
                className="rounded-full border border-border text-text-primary px-6 py-2.5 hover:bg-surface hover:scale-[1.02] transition-all"
              >
                View All Users
              </a>
            </div>
          </div>
        )}

        {!submitSuccess && (
          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={submitting || !selectedRole || !name || !email}
              className="rounded-full bg-accent text-text-primary font-semibold px-6 py-2.5 hover:bg-accent-hover hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create User'}
            </button>
            <a
              href="/users"
              className="rounded-full border border-border text-text-primary px-6 py-2.5 hover:bg-surface hover:scale-[1.02] transition-all"
            >
              Cancel
            </a>
          </div>
        )}
      </form>
    </div>
  )
}
