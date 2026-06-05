'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { LabRole as SharedLabRole } from '@ultranos/shared-types'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  const isDemotingManager = currentRole === 'LAB_MANAGER' && newRole !== 'LAB_MANAGER'

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Staff Role</DialogTitle>
          <DialogDescription>
            Change <span className="font-medium text-foreground">{truncate(email, 30) || 'this staff member'}</span> from{' '}
            <RoleBadge role={currentRole} /> to <RoleBadge role={newRole} />?
          </DialogDescription>
        </DialogHeader>

        {isDemotingManager && (
          <div className="mt-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            This will remove their manager privileges. If they are the last manager, this operation will be blocked.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Updating...' : 'Confirm'}
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
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Staff Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove{' '}
            <span className="font-medium text-foreground">{truncate(email, 30) || 'this staff member'}</span>{' '}
            from this lab? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
            aria-label="Confirm Remove"
          >
            {submitting ? 'Removing…' : 'Confirm Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LabStaffPage() {
  const params = useParams()
  const router = useRouter()
  const labId = params.labId as string

  const [staff, setStaff] = useState<StaffMember[]>([])
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
      setError((err as Error)?.message ?? 'Failed to load staff list')
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
      setSuccessMessage(`Role updated successfully`)
      await fetchStaff()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Failed to update role'
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
      setSuccessMessage('Staff member removed successfully')
      await fetchStaff()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to remove staff member')
      setPendingRemove(null)
    } finally {
      setSubmittingRemove(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push(`/labs/${labId}`)}
          >
            &larr; Back to Lab Detail
          </Button>
          <Button
            onClick={() => setShowAssignModal(true)}
            aria-label="Add Staff"
          >
            Add Staff
          </Button>
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="mt-4 rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">
            {successMessage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Staff table */}
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card">
                <th className="px-4 py-3 text-start font-medium">Practitioner ID</th>
                <th className="px-4 py-3 text-start font-medium">Email</th>
                <th className="px-4 py-3 text-start font-medium">Role</th>
                <th className="px-4 py-3 text-start font-medium">Assigned</th>
                <th className="px-4 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading staff...
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No staff assigned to this lab
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.practitionerId} className="border-t border-border hover:bg-card">
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
                        aria-label="Remove"
                        className="text-destructive border-destructive hover:bg-destructive/10"
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
            setSuccessMessage('Staff member assigned successfully')
            await fetchStaff()
            setTimeout(() => setSuccessMessage(null), 5000)
          }}
        />
      </div>
  )
}
