'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { LabRole as SharedLabRole } from '@ultranos/shared-types'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Users, FileSearch } from '@ultranos/ui-kit/icons'
import AssignStaffModal from '@/components/lab-staff/AssignStaffModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

type LabRole = 'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'

const LAB_ROLES: LabRole[] = ['LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER']

const ROLE_LABELS: Record<LabRole, string> = {
  LAB_TECH: 'Lab Tech',
  SENIOR_TECH: 'Senior Tech',
  SUPERVISOR: 'Supervisor',
  LAB_MANAGER: 'Lab Manager',
}

const ROLE_BADGE_VARIANTS: Record<LabRole, 'secondary' | 'default' | 'warning' | 'success'> = {
  LAB_TECH: 'secondary',
  SENIOR_TECH: 'default',
  SUPERVISOR: 'warning',
  LAB_MANAGER: 'success',
}

interface StaffMember {
  practitionerId: string
  email: string
  labRole: LabRole
  createdAt: string
}

function RoleBadge({ role }: { role: LabRole }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANTS[role] ?? 'secondary'}>
      {ROLE_LABELS[role] ?? role}
    </Badge>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s
  return s.slice(0, len) + '...'
}

/** Confirmation modal for role changes (AC #2, #3) */
function RoleChangeModal({
  email,
  currentRole,
  newRole,
  onConfirm,
  onCancel,
  submitting,
  open,
}: {
  email: string
  currentRole: LabRole
  newRole: LabRole
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
  open: boolean
}) {
  const t = useTranslations('labs')
  const tCommon = useTranslations('common')
  const isDemotingManager = currentRole === 'LAB_MANAGER' && newRole !== 'LAB_MANAGER'

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staffChangeRoleTitle')}</DialogTitle>
          <DialogDescription>
            {t('staffChangeRoleDesc')}
          </DialogDescription>
        </DialogHeader>

        {isDemotingManager && (
          <div className="mt-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            This will remove their manager privileges. If they are the last manager, this operation will be blocked.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Updating...' : tCommon('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Confirmation modal for staff removal */
function RemoveStaffModal({
  email,
  onConfirm,
  onCancel,
  submitting,
  open,
}: {
  email: string
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
  open: boolean
}) {
  const t = useTranslations('labs')
  const tCommon = useTranslations('common')

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staffRemoveTitle')}</DialogTitle>
          <DialogDescription>
            {t('staffRemoveDesc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
            aria-label="Confirm Remove"
          >
            {submitting ? 'Removing…' : tCommon('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LabStaffPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('labs')
  const labId = params.labId as string

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submittingRoleChange, setSubmittingRoleChange] = useState(false)
  const [submittingRemove, setSubmittingRemove] = useState(false)

  // Modal state
  const [pendingChange, setPendingChange] = useState<{
    practitionerId: string
    email: string
    currentRole: LabRole
    newRole: LabRole
  } | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{
    practitionerId: string
    email: string
  } | null>(null)

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listLabStaff.query({ labId })
      setStaff(result as StaffMember[])
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('staffActionError'))
    } finally {
      setLoading(false)
    }
  }, [labId])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  function handleRoleSelect(member: StaffMember, newRole: LabRole) {
    if (newRole === member.labRole) return
    setPendingChange({
      practitionerId: member.practitionerId,
      email: member.email,
      currentRole: member.labRole,
      newRole,
    })
  }

  async function handleConfirmRoleChange() {
    if (!pendingChange) return
    try {
      setSubmittingRoleChange(true)
      setError(null)
      await trpc.admin.updateLabStaffRole.mutate({
        labId,
        targetPractitionerId: pendingChange.practitionerId,
        newRole: pendingChange.newRole as SharedLabRole,
      })
      setPendingChange(null)
      setSuccessMessage(t('staffActionSuccess'))
      await fetchStaff()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? t('staffActionError')
      if (msg.includes('Cannot demote the last Lab Manager')) {
        setError('Cannot demote the last Lab Manager')
      } else {
        setError(msg)
      }
      setPendingChange(null)
    } finally {
      setSubmittingRoleChange(false)
    }
  }

  async function handleConfirmRemove() {
    if (!pendingRemove) return
    try {
      setSubmittingRemove(true)
      setError(null)
      await trpc.admin.removeStaffFromLab.mutate({
        labId,
        practitionerId: pendingRemove.practitionerId,
      })
      setPendingRemove(null)
      setSuccessMessage(t('staffActionSuccess'))
      await fetchStaff()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('staffActionError'))
      setPendingRemove(null)
    } finally {
      setSubmittingRemove(false)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = staff.filter(
    (m) => !q || m.email.toLowerCase().includes(q) || m.practitionerId.toLowerCase().includes(q),
  )

  return (
    <div className="flex flex-col gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/labs/${labId}`)}
          >
            {t('staffBackToLab')}
          </Button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground">{t('staffPageTitle')}</h1>

        {/* Toolbar: search + add staff — one row, always visible */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="text"
            dir="auto"
            placeholder={t('staffSearchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1"
            aria-label={t('staffSearchPlaceholder')}
          />
          <Button
            onClick={() => setShowAssignModal(true)}
            aria-label={t('staffAddStaff')}
          >
            {t('staffAddStaff')}
          </Button>
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">
            {successMessage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Staff table — single cohesive box */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('staffLoading')}</div>
          ) : staff.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={Users}
                title={t('staffNoStaff')}
                description={t('staffNoStaffDescription')}
                action={{ label: t('staffAddStaff'), onClick: () => setShowAssignModal(true) }}
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={FileSearch}
                title={t('noResultsTitle')}
                description={t('noResultsDescription')}
                action={{ label: t('clearSearch'), onClick: () => setSearch('') }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('staffColName')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('staffColEmail')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('staffColRole')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('staffColStatus')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('staffColActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((member) => (
                    <tr key={member.practitionerId} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {member.practitionerId.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {truncate(member.email, 25)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={member.labRole}
                          onChange={(e) => handleRoleSelect(member, e.target.value as LabRole)}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {LAB_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPendingRemove({ practitionerId: member.practitionerId, email: member.email })}
                          aria-label={t('staffRemove')}
                          className="text-destructive border-destructive hover:bg-destructive/10"
                        >
                          {t('staffRemove')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Confirmation modal */}
        {pendingChange && (
          <RoleChangeModal
            open={pendingChange !== null}
            email={pendingChange.email}
            currentRole={pendingChange.currentRole}
            newRole={pendingChange.newRole}
            onConfirm={handleConfirmRoleChange}
            onCancel={() => setPendingChange(null)}
            submitting={submittingRoleChange}
          />
        )}

        {pendingRemove && (
          <RemoveStaffModal
            open={pendingRemove !== null}
            email={pendingRemove.email}
            onConfirm={handleConfirmRemove}
            onCancel={() => setPendingRemove(null)}
            submitting={submittingRemove}
          />
        )}

        <AssignStaffModal
          fixedLabId={labId}
          open={showAssignModal}
          onOpenChange={setShowAssignModal}
          onAssigned={async () => {
            setShowAssignModal(false)
            setSuccessMessage(t('staffActionSuccess'))
            await fetchStaff()
            setTimeout(() => setSuccessMessage(null), 5000)
          }}
        />
      </div>
  )
}
