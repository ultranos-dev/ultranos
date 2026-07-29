'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface UserDetail {
  id: string
  name: string
  givenName: string
  familyName: string
  email: string
  role: string
  moduleCode?: string | null
  moduleName?: string | null
  status: string
  suspensionReason: string | null
  suspendedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
    ACTIVE: 'success',
    SUSPENDED: 'destructive',
    PENDING_INVITE: 'warning',
  }

  const labelMap: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_INVITE: 'Pending Invite',
  }

  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {labelMap[status] ?? status}
    </Badge>
  )
}

function formatDateTime(iso: string | null, never: string): string {
  if (!iso) return never
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UserDetailPage() {
  const t = useTranslations('users')
  const params = useParams()
  const _router = useRouter()
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
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
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
      setSaveMessage(t('detailActionSuccess'))
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
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
      setActionMessage(t('detailActionSuccess'))
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
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
      setActionMessage(t('detailActionSuccess'))
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
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
      setActionMessage(t('detailActionSuccess'))
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
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
      setActionMessage(t('detailActionSuccess'))
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground p-8">{t('detailLoading')}</div>
  }

  if (error && !user) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/users" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('detailBackToUsers')}</Link>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!user) return <div className="text-muted-foreground p-8">{t('detailNotFound')}</div>

  return (
    <div className="flex flex-col gap-4">
        <Link href="/users" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('detailBackToUsers')}</Link>

        <h1 className="text-2xl font-semibold text-foreground">{user.name}</h1>

        {/* Messages */}
        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {saveMessage && (
          <div className="rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">{saveMessage}</div>
        )}
        {actionMessage && (
          <div className="rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">{actionMessage}</div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Section A: Profile */}
          <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              <span className="wavy-divider">{t('detailProfile')}</span>
            </h2>

            <div className="mt-4 space-y-4">
              {/* Name — editable */}
              <div>
                <label htmlFor="user-name" className="block text-sm font-medium text-muted-foreground">{t('detailName')}</label>
                <Input
                  id="user-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Email — read-only */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailEmail')}</dt>
                <dd className="mt-1 text-sm text-foreground">{user.email}</dd>
              </div>

              {/* Role */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailRole')}</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {user.role}
                  {user.moduleName && <span className="text-muted-foreground"> ({user.moduleName})</span>}
                </dd>
              </div>

              {/* Status */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailStatus')}</dt>
                <dd className="mt-1"><StatusBadge status={user.status} /></dd>
              </div>

              {/* Suspension reason alert */}
              {user.status === 'SUSPENDED' && user.suspensionReason && (
                <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  <strong>{t('detailSuspensionReason')}:</strong> {user.suspensionReason}
                </div>
              )}

              {/* Last Login */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailLastLogin')}</dt>
                <dd className="mt-1 text-sm text-foreground">{formatDateTime(user.lastLoginAt, t('detailNever'))}</dd>
              </div>

              {/* Created */}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailCreatedAt')}</dt>
                <dd className="mt-1 text-sm text-foreground">{formatDateTime(user.createdAt, t('detailNever'))}</dd>
              </div>

              {/* Save button */}
              <Button
                onClick={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? t('detailLoading') : t('detailSave')}
              </Button>
            </div>
          </div>

          {/* Section B: Actions */}
          <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              <span className="wavy-divider">{t('detailActions')}</span>
            </h2>

            <div className="mt-4 space-y-4">
              {/* Suspend User — visible when ACTIVE or PENDING_INVITE */}
              {(user.status === 'ACTIVE' || user.status === 'PENDING_INVITE') && (
                <div>
                  {showSuspendForm ? (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 space-y-3">
                      <label htmlFor="suspend-reason" className="block text-sm font-medium text-destructive">
                        {t('detailSuspensionReasonLabel')}
                      </label>
                      <Textarea
                        id="suspend-reason"
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        rows={3}
                        placeholder={t('detailSuspendPlaceholder')}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          onClick={handleSuspend}
                          disabled={!suspendReason.trim() || actionLoading}
                        >
                          {actionLoading ? t('detailLoading') : t('detailSuspend')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setShowSuspendForm(false); setSuspendReason('') }}
                        >
                          {t('detailCancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setShowSuspendForm(true)}
                    >
                      {t('detailSuspend')}
                    </Button>
                  )}
                </div>
              )}

              {/* Reactivate User — visible when SUSPENDED */}
              {user.status === 'SUSPENDED' && (
                <Button
                  variant="success"
                  onClick={handleReactivate}
                  disabled={actionLoading}
                >
                  {actionLoading ? t('detailLoading') : t('detailReactivate')}
                </Button>
              )}

              {/* Resend Invitation — visible when PENDING_INVITE */}
              {user.status === 'PENDING_INVITE' && (
                <Button
                  variant="outline"
                  onClick={handleResendInvitation}
                  disabled={actionLoading}
                >
                  {actionLoading ? t('detailLoading') : t('detailResendInvitation')}
                </Button>
              )}

              {/* Reset Password — visible when ACTIVE */}
              {user.status === 'ACTIVE' && (
                <Button
                  variant="outline"
                  onClick={handleResetPassword}
                  disabled={actionLoading}
                >
                  {actionLoading ? t('detailLoading') : t('detailResetPassword')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}
