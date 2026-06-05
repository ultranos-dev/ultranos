'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
// ROLE_MODULE_MAP and MODULE_DISPLAY_NAMES reserved for future role-based module config
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
      } catch (err: unknown) {
        setError((err as Error)?.message ?? 'Failed to load available roles')
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

    // Client-side password validation
    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.')
      return
    }

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

      const result = await trpc.admin.createUser.mutate({ name, email, role: selectedRole, password })
      setCreatedUser(result)
      setSubmitSuccess(true)
    } catch (err: unknown) {
      setSubmitError((err as Error)?.message ?? 'Failed to validate role')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading available roles...</div>
  }

  if (error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {error}</div>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-4xl font-bold tracking-tight">Create Staff User</h1>
      <p className="mt-4 text-muted-foreground">
        Assign roles based on your organization&apos;s active module subscriptions.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="rounded-3xl bg-popover p-5 border border-border space-y-6">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-muted-foreground">
              Full Name
            </label>
            <Input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-muted-foreground">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-muted-foreground">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="mt-1.5"
            />
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-muted-foreground">
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1.5"
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-1.5 text-sm text-red-600">Passwords do not match</p>
            )}
          </div>

          {/* Role Selector */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Role</p>
            <div className="space-y-2">
              {/* Available roles — selectable */}
              {availableRoles.map((r) => (
                <label
                  key={r.role}
                  className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    selectedRole === r.role
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-card'
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
                    <span className="font-medium text-sm text-foreground">{r.role}</span>
                    {r.moduleName && (
                      <span className="ms-2 text-xs text-muted-foreground">({r.moduleName})</span>
                    )}
                  </div>
                </label>
              ))}

              {/* Unavailable roles — disabled with subscription prompt */}
              {unavailableRoles.map((r) => (
                <div
                  key={r.role}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 opacity-60"
                >
                  <input type="radio" name="role" disabled className="accent-accent" />
                  <div>
                    <span className="font-medium text-sm text-muted-foreground">{r.role}</span>
                    <span className="ms-2 text-xs text-muted-foreground">
                      &mdash;{' '}
                      <a
                        href="/subscriptions"
                        className="text-primary hover:underline"
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
              <Button
                type="button"
                onClick={() => {
                  setCreatedUser(null)
                  setSubmitSuccess(false)
                  setName('')
                  setEmail('')
                  setPassword('')
                  setConfirmPassword('')
                  setSelectedRole('')
                  setSubmitError(null)
                }}
              >
                Create Another User
              </Button>
              <Button variant="outline" asChild>
                <a href="/users">View All Users</a>
              </Button>
            </div>
          </div>
        )}

        {!submitSuccess && (
          <div className="mt-6 flex gap-3">
            <Button
              type="submit"
              disabled={submitting || !selectedRole || !name || !email || !password || password !== confirmPassword}
            >
              {submitting ? 'Creating...' : 'Create User'}
            </Button>
            <Button variant="outline" asChild>
              <a href="/users">Cancel</a>
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
