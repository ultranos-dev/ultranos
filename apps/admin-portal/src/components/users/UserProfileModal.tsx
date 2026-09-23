'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  ModalHeader,
  DialogDescription,
} from '@/components/ui/dialog'
import { StaffAvatar } from './StaffAvatar'

interface UserDetail {
  id: string
  name: string
  givenName: string
  familyName: string
  email: string
  role: string
  moduleName?: string | null
  status: string
  suspensionReason: string | null
  suspendedAt: string | null
  archivedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string | null
  hasMfa?: boolean
  phone: string | null
  jobTitle: string | null
  department: string | null
  employeeId: string | null
  avatarUrl: string | null
  qualification: string | null
  registrationNumber: string | null
  licenseExpiry: string | null
  clinicName: string | null
  clinicAddress: string | null
  consultationLanguages: string[] | null
}

type Form = {
  givenName: string; familyName: string; role: string; phone: string
  jobTitle: string; department: string; employeeId: string
  qualification: string; registrationNumber: string; licenseExpiry: string
  clinicName: string; clinicAddress: string; consultationLanguages: string
}

function toForm(u: UserDetail): Form {
  return {
    givenName: u.givenName ?? '', familyName: u.familyName ?? '', role: u.role ?? '', phone: u.phone ?? '',
    jobTitle: u.jobTitle ?? '', department: u.department ?? '', employeeId: u.employeeId ?? '',
    qualification: u.qualification ?? '', registrationNumber: u.registrationNumber ?? '', licenseExpiry: (u.licenseExpiry ?? '').slice(0, 10),
    clinicName: u.clinicName ?? '', clinicAddress: u.clinicAddress ?? '', consultationLanguages: (u.consultationLanguages ?? []).join(', '),
  }
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
    ACTIVE: 'success', SUSPENDED: 'destructive', PENDING_INVITE: 'warning', ARCHIVED: 'secondary',
  }
  const labelMap: Record<string, string> = {
    ACTIVE: 'Active', SUSPENDED: 'Suspended', PENDING_INVITE: 'Pending Invite', ARCHIVED: 'Archived',
  }
  return <Badge variant={variantMap[status] ?? 'secondary'}>{labelMap[status] ?? status}</Badge>
}

function fmt(iso: string | null, never: string): string {
  if (!iso) return never
  return new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function LabeledInput({ id, label, value, onChange, type = 'text', readOnly = false }: {
  id: string; label: string; value: string; onChange?: (v: string) => void; type?: string; readOnly?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-muted-foreground">{label}</label>
      <Input id={id} type={type} value={value} readOnly={readOnly} disabled={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined} className="mt-1" />
    </div>
  )
}

/**
 * User profile detail modal — enterprise profile management. Editable practitioner
 * profile (all fields) + role edit (subscription-gated) + status-dependent actions
 * (suspend / reactivate / resend / reset) + Archive (soft-delete) / Restore.
 */
export function UserProfileModal({
  open, onOpenChange, userId, onChanged,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; userId: string; onChanged: () => void
}) {
  const t = useTranslations('users')
  const [user, setUser] = useState<UserDetail | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [roleOptions, setRoleOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [showSuspendForm, setShowSuspendForm] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const result = await trpc.admin.getUser.query({ userId })
      setUser(result as UserDetail)
      setForm(toForm(result as UserDetail))
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
    } finally {
      setLoading(false)
    }
  }, [userId, t])

  useEffect(() => {
    if (!open) return
    setMessage(null); setShowSuspendForm(false); setSuspendReason('')
    fetchUser()
    trpc.subscription.getAvailableRoles.query()
      .then((r) => setRoleOptions(r.availableRoles.map((x: { role: string }) => x.role)))
      .catch(() => setRoleOptions([]))
  }, [open, fetchUser])

  function setField<K extends keyof Form>(key: K, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  const isDirty = user !== null && form !== null && JSON.stringify(form) !== JSON.stringify(toForm(user))

  async function handleSave() {
    if (!user || !form || !isDirty) return
    try {
      setSaving(true); setMessage(null); setError(null)
      await trpc.admin.updateUser.mutate({
        userId,
        givenName: form.givenName, familyName: form.familyName,
        ...(form.role && form.role !== user.role ? { role: form.role } : {}),
        phone: form.phone, jobTitle: form.jobTitle, department: form.department,
        employeeId: form.employeeId, qualification: form.qualification,
        registrationNumber: form.registrationNumber, licenseExpiry: form.licenseExpiry,
        clinicName: form.clinicName, clinicAddress: form.clinicAddress,
        consultationLanguages: form.consultationLanguages.split(',').map((s) => s.trim()).filter(Boolean),
      } as never)
      setMessage(t('detailActionSuccess'))
      onChanged()
      await fetchUser()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
    } finally {
      setSaving(false)
    }
  }

  async function runAction(fn: () => Promise<unknown>) {
    try {
      setActionLoading(true); setMessage(null); setError(null)
      await fn()
      setMessage(t('detailActionSuccess'))
      onChanged()
      await fetchUser()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
    } finally {
      setActionLoading(false)
    }
  }

  const roleSelectOptions = user ? Array.from(new Set([user.role, ...roleOptions].filter(Boolean))) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" hideClose>
        <ModalHeader title={user?.name ?? t('detailLoading')} tone="primary" inset dialog />
        <DialogDescription className="sr-only">User profile and management actions</DialogDescription>

        {loading || !form ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('detailLoading')}</div>
        ) : !user ? (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error ?? t('detailNotFound')}</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={user.status} />
              {user.hasMfa ? <Badge variant="success">MFA Enrolled</Badge> : <Badge variant="warning">MFA Not Enrolled</Badge>}
            </div>

            {error && <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {message && <div className="rounded-2xl border border-success/20 bg-success/10 p-3 text-sm text-success">{message}</div>}
            {user.status === 'SUSPENDED' && user.suspensionReason && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                <strong>{t('detailSuspensionReason')}:</strong> {user.suspensionReason}
              </div>
            )}

            {/* Identity */}
            <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</h3>
              <div className="mt-3 flex items-center gap-4">
                <StaffAvatar
                  practitionerId={user.id}
                  photoKey={user.avatarUrl}
                  lastKnownUpdate={user.updatedAt ?? user.createdAt ?? new Date().toISOString()}
                  name={user.name}
                  onUpdated={(key, lastUpdated) => {
                    setUser((u) => (u ? { ...u, avatarUrl: key, updatedAt: lastUpdated } : u))
                    onChanged()
                  }}
                />
                <p className="text-sm text-muted-foreground">Click the photo to upload or change the staff photo.</p>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput id="up-given" label="Given Name" value={form.givenName} onChange={(v) => setField('givenName', v)} />
                <LabeledInput id="up-family" label="Family Name" value={form.familyName} onChange={(v) => setField('familyName', v)} />
                <LabeledInput id="up-email" label="Email" value={user.email ?? ''} readOnly />
                <div>
                  <label htmlFor="up-role" className="block text-sm font-medium text-muted-foreground">Role</label>
                  <select id="up-role" value={form.role} onChange={(e) => setField('role', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                    {roleSelectOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <LabeledInput id="up-job" label="Job Title" value={form.jobTitle} onChange={(v) => setField('jobTitle', v)} />
                <LabeledInput id="up-dept" label="Department" value={form.department} onChange={(v) => setField('department', v)} />
                <LabeledInput id="up-emp" label="Employee ID" value={form.employeeId} onChange={(v) => setField('employeeId', v)} />
                <LabeledInput id="up-phone" label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} />
              </div>
            </div>

            {/* Professional & Practice */}
            <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Professional &amp; Practice</h3>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput id="up-qual" label="Qualification" value={form.qualification} onChange={(v) => setField('qualification', v)} />
                <LabeledInput id="up-reg" label="Registration / License No." value={form.registrationNumber} onChange={(v) => setField('registrationNumber', v)} />
                <LabeledInput id="up-lic" label="License Expiry" type="date" value={form.licenseExpiry} onChange={(v) => setField('licenseExpiry', v)} />
                <LabeledInput id="up-lang" label="Consultation Languages (comma-separated)" value={form.consultationLanguages} onChange={(v) => setField('consultationLanguages', v)} />
                <LabeledInput id="up-clinic" label="Clinic Name" value={form.clinicName} onChange={(v) => setField('clinicName', v)} />
                <LabeledInput id="up-caddr" label="Clinic Address" value={form.clinicAddress} onChange={(v) => setField('clinicAddress', v)} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>{t('detailLastLogin')}: <span className="font-numeric text-foreground">{fmt(user.lastLoginAt, t('detailNever'))}</span></span>
                <span>{t('detailCreatedAt')}: <span className="font-numeric text-foreground">{fmt(user.createdAt, t('detailNever'))}</span></span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!isDirty || saving}>{saving ? t('detailLoading') : t('detailSave')}</Button>
            </div>

            {/* Actions */}
            <div className="rounded-xl bg-card p-4 shadow-card ring-[0.65px] ring-border/50">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('detailActions')}</h3>
              <div className="mt-3 flex flex-wrap gap-3">
                {(user.status === 'ACTIVE' || user.status === 'PENDING_INVITE') && !showSuspendForm && (
                  <Button variant="destructive" onClick={() => setShowSuspendForm(true)}>{t('detailSuspend')}</Button>
                )}
                {user.status === 'SUSPENDED' && (
                  <Button variant="success" disabled={actionLoading}
                    onClick={() => runAction(() => trpc.admin.reactivateUser.mutate({ userId }))}>
                    {actionLoading ? t('detailLoading') : t('detailReactivate')}
                  </Button>
                )}
                {user.status === 'PENDING_INVITE' && (
                  <Button variant="outline" disabled={actionLoading}
                    onClick={() => runAction(() => trpc.admin.resendInvitation.mutate({ userId }))}>
                    {actionLoading ? t('detailLoading') : t('detailResendInvitation')}
                  </Button>
                )}
                {user.status === 'ACTIVE' && (
                  <Button variant="outline" disabled={actionLoading}
                    onClick={() => runAction(() => trpc.admin.resetUserPassword.mutate({ userId }))}>
                    {actionLoading ? t('detailLoading') : t('detailResetPassword')}
                  </Button>
                )}
                {user.status === 'ARCHIVED' ? (
                  <Button variant="success" disabled={actionLoading}
                    onClick={() => runAction(() => trpc.admin.restoreUser.mutate({ userId }))}>
                    {actionLoading ? t('detailLoading') : (t('detailRestore') ?? 'Restore')}
                  </Button>
                ) : (
                  <Button variant="destructive" disabled={actionLoading}
                    onClick={() => { if (confirm('Archive this user? They will be signed out and hidden from the default list.')) runAction(() => trpc.admin.archiveUser.mutate({ userId })) }}>
                    {t('detailArchive') ?? 'Archive'}
                  </Button>
                )}
              </div>

              {showSuspendForm && (
                <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
                  <label htmlFor="up-suspend" className="block text-sm font-medium text-destructive">{t('detailSuspensionReasonLabel')}</label>
                  <Textarea id="up-suspend" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} rows={3} placeholder={t('detailSuspendPlaceholder')} />
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={!suspendReason.trim() || actionLoading}
                      onClick={() => runAction(() => trpc.admin.suspendUser.mutate({ userId, reason: suspendReason.trim() })).then(() => { setShowSuspendForm(false); setSuspendReason('') })}>
                      {actionLoading ? t('detailLoading') : t('detailSuspend')}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowSuspendForm(false); setSuspendReason('') }}>{t('detailCancel')}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
