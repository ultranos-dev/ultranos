'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

interface UserDetail {
  id: string
  name: string
  givenName: string
  familyName: string
  email: string
  role: string
  moduleCode: string | null
  moduleName: string | null
  status: string
  suspensionReason: string | null
  suspendedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success-subtle text-success',
    SUSPENDED: 'bg-danger-subtle text-danger',
    PENDING_INVITE: 'bg-warning-subtle text-warning',
  }

  const labelMap: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_INVITE: 'Pending Invite',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.userId as string

  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Profile edit state
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Action state
  const [showSuspendForm, setShowSuspendForm] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.getUser.query({ userId })
      setUser(result)
      setEditName(result.name)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load user')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const isDirty = user !== null && editName.trim() !== '' && editName !== user.name

  async function handleSave() {
    if (!isDirty || !user) return
    try {
      setSaving(true)
      setSaveMessage(null)
      setError(null)
      await trpc.admin.updateUser.mutate({ userId, name: editName.trim() })
      setUser({ ...user, name: editName.trim() })
      setSaveMessage('Changes saved.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleSuspend() {
    if (!suspendReason.trim() || !user) return
    try {
      setActionLoading(true)
      setActionMessage(null)
      setError(null)
      await trpc.admin.suspendUser.mutate({ userId, reason: suspendReason.trim() })
      setUser({ ...user, status: 'SUSPENDED', suspensionReason: suspendReason.trim(), suspendedAt: new Date().toISOString() })
      setShowSuspendForm(false)
      setSuspendReason('')
      setActionMessage('User suspended.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to suspend user')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReactivate() {
    if (!user) return
    try {
      setActionLoading(true)
      setActionMessage(null)
      setError(null)
      await trpc.admin.reactivateUser.mutate({ userId })
      setUser({ ...user, status: 'ACTIVE', suspensionReason: null, suspendedAt: null })
      setActionMessage('User reactivated.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reactivate user')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResendInvitation() {
    if (!user) return
    try {
      setActionLoading(true)
      setActionMessage(null)
      setError(null)
      await trpc.admin.resendInvitation.mutate({ userId })
      setActionMessage('Invitation resent.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resend invitation')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!user) return
    try {
      setActionLoading(true)
      setActionMessage(null)
      setError(null)
      await trpc.admin.resetUserPassword.mutate({ userId })
      setActionMessage('Password reset email sent.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reset password')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div className="text-text-secondary p-8">Loading user details...</div>
  }

  if (error && !user) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/users" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Users</Link>
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <>
      <TopHeader title={user.name} description={user.email} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/users" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Users</Link>

        {/* Messages */}
        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}
        {saveMessage && (
          <div className="mt-4 rounded-2xl bg-success-subtle border border-success/20 p-3 text-sm text-success">{saveMessage}</div>
        )}
        {actionMessage && (
          <div className="mt-4 rounded-2xl bg-success-subtle border border-success/20 p-3 text-sm text-success">{actionMessage}</div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Section A: Profile */}
          <div className="rounded-3xl bg-white p-5 border border-border">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              <span className="wavy-divider">Profile</span>
            </h2>

            <div className="mt-4 space-y-4">
              {/* Name — editable */}
              <div>
                <label htmlFor="user-name" className="block text-sm font-medium text-text-secondary">Name</label>
                <input
                  id="user-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>

              {/* Email — read-only */}
              <div>
                <dt className="text-sm font-medium text-text-secondary">Email</dt>
                <dd className="mt-1 text-sm text-text-primary">{user.email}</dd>
              </div>

              {/* Role */}
              <div>
                <dt className="text-sm font-medium text-text-secondary">Role</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {user.role}
                  {user.moduleName && <span className="text-text-muted"> ({user.moduleName})</span>}
                </dd>
              </div>

              {/* Status */}
              <div>
                <dt className="text-sm font-medium text-text-secondary">Status</dt>
                <dd className="mt-1"><StatusBadge status={user.status} /></dd>
              </div>

              {/* Suspension reason alert */}
              {user.status === 'SUSPENDED' && user.suspensionReason && (
                <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">
                  <strong>Suspension Reason:</strong> {user.suspensionReason}
                </div>
              )}

              {/* Last Login */}
              <div>
                <dt className="text-sm font-medium text-text-secondary">Last Login</dt>
                <dd className="mt-1 text-sm text-text-primary">{formatDateTime(user.lastLoginAt)}</dd>
              </div>

              {/* Created */}
              <div>
                <dt className="text-sm font-medium text-text-secondary">Created</dt>
                <dd className="mt-1 text-sm text-text-primary">{formatDateTime(user.createdAt)}</dd>
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="rounded-full bg-brand-lime px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-50 hover:bg-brand-lime/90 transition-colors hover:scale-[1.02] transition-transform duration-200"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Section B: Actions */}
          <div className="rounded-3xl bg-white p-5 border border-border">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              <span className="wavy-divider">Actions</span>
            </h2>

            <div className="mt-4 space-y-4">
              {/* Suspend User — visible when ACTIVE or PENDING_INVITE */}
              {(user.status === 'ACTIVE' || user.status === 'PENDING_INVITE') && (
                <div>
                  {showSuspendForm ? (
                    <div className="rounded-2xl border border-danger/20 bg-danger-subtle p-4 space-y-3">
                      <label htmlFor="suspend-reason" className="block text-sm font-medium text-danger">
                        Suspension Reason (required)
                      </label>
                      <textarea
                        id="suspend-reason"
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                        placeholder="Enter reason for suspension..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSuspend}
                          disabled={!suspendReason.trim() || actionLoading}
                          className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-red-700 hover:scale-[1.02] transition-transform duration-200"
                        >
                          {actionLoading ? 'Suspending...' : 'Confirm Suspend'}
                        </button>
                        <button
                          onClick={() => { setShowSuspendForm(false); setSuspendReason('') }}
                          className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSuspendForm(true)}
                      className="rounded-full border border-danger/30 bg-danger-subtle px-6 py-2.5 text-sm font-semibold text-danger hover:bg-danger-subtle/80 hover:scale-[1.02] transition-transform duration-200"
                    >
                      Suspend User
                    </button>
                  )}
                </div>
              )}

              {/* Reactivate User — visible when SUSPENDED */}
              {user.status === 'SUSPENDED' && (
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="rounded-full bg-green-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-green-700 hover:scale-[1.02] transition-transform duration-200"
                >
                  {actionLoading ? 'Reactivating...' : 'Reactivate User'}
                </button>
              )}

              {/* Resend Invitation — visible when PENDING_INVITE */}
              {user.status === 'PENDING_INVITE' && (
                <button
                  onClick={handleResendInvitation}
                  disabled={actionLoading}
                  className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-text-primary disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  {actionLoading ? 'Sending...' : 'Resend Invitation'}
                </button>
              )}

              {/* Reset Password — visible when ACTIVE */}
              {user.status === 'ACTIVE' && (
                <button
                  onClick={handleResetPassword}
                  disabled={actionLoading}
                  className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-text-primary disabled:opacity-50 hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  {actionLoading ? 'Sending...' : 'Reset Password'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
