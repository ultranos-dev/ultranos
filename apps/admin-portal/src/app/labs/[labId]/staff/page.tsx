'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

type LabRole = 'LAB_TECH' | 'SENIOR_TECH' | 'SUPERVISOR' | 'LAB_MANAGER'

const LAB_ROLES: LabRole[] = ['LAB_TECH', 'SENIOR_TECH', 'SUPERVISOR', 'LAB_MANAGER']

const ROLE_LABELS: Record<LabRole, string> = {
  LAB_TECH: 'Lab Tech',
  SENIOR_TECH: 'Senior Tech',
  SUPERVISOR: 'Supervisor',
  LAB_MANAGER: 'Lab Manager',
}

const ROLE_BADGE_COLORS: Record<LabRole, string> = {
  LAB_TECH: 'bg-gray-100 text-gray-700',
  SENIOR_TECH: 'bg-blue-100 text-blue-700',
  SUPERVISOR: 'bg-amber-100 text-amber-700',
  LAB_MANAGER: 'bg-green-100 text-green-700',
}

interface StaffMember {
  practitionerId: string
  email: string
  labRole: LabRole
  createdAt: string
}

function RoleBadge({ role }: { role: LabRole }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[role] ?? 'bg-surface text-text-secondary'}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
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
}: {
  email: string
  currentRole: LabRole
  newRole: LabRole
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  const isDemotingManager = currentRole === 'LAB_MANAGER' && newRole !== 'LAB_MANAGER'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text-primary">Change Staff Role</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Change <span className="font-medium text-text-primary">{truncate(email, 30) || 'this staff member'}</span> from{' '}
          <RoleBadge role={currentRole} /> to <RoleBadge role={newRole} />?
        </p>

        {isDemotingManager && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            This will remove their manager privileges. If they are the last manager, this operation will be blocked.
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-border text-text-primary px-6 py-2.5 text-sm hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-full px-6 py-2.5 text-sm font-semibold bg-accent text-text-primary disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
          >
            {submitting ? 'Updating...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
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
  const [submitting, setSubmitting] = useState(false)

  // Modal state
  const [pendingChange, setPendingChange] = useState<{
    practitionerId: string
    email: string
    currentRole: LabRole
    newRole: LabRole
  } | null>(null)

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listLabStaff.query({ labId })
      setStaff(result as StaffMember[])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load staff list')
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
      setSubmitting(true)
      setError(null)
      await trpc.admin.updateLabStaffRole.mutate({
        labId,
        targetPractitionerId: pendingChange.practitionerId,
        newRole: pendingChange.newRole,
      })
      setPendingChange(null)
      setSuccessMessage(`Role updated successfully`)
      await fetchStaff()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to update role'
      if (msg.includes('Cannot demote the last Lab Manager')) {
        setError('Cannot demote the last Lab Manager')
      } else {
        setError(msg)
      }
      setPendingChange(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <TopHeader title="Lab Staff" description="Manage staff roles for this lab" />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <button
          onClick={() => router.push(`/labs/${labId}`)}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          &larr; Back to Lab Detail
        </button>

        {/* Success toast */}
        {successMessage && (
          <div className="mt-4 rounded-2xl bg-success-subtle border border-success/20 p-3 text-sm text-success">
            {successMessage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Staff table */}
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black text-white">
                <th className="px-4 py-3 text-start font-medium">Practitioner ID</th>
                <th className="px-4 py-3 text-start font-medium">Email</th>
                <th className="px-4 py-3 text-start font-medium">Role</th>
                <th className="px-4 py-3 text-start font-medium">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                    Loading staff...
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                    No staff assigned to this lab
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.practitionerId} className="border-t border-border hover:bg-surface">
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {member.practitionerId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {truncate(member.email, 25)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={member.labRole}
                        onChange={(e) => handleRoleSelect(member, e.target.value as LabRole)}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                      >
                        {LAB_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(member.createdAt)}
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
            email={pendingChange.email}
            currentRole={pendingChange.currentRole}
            newRole={pendingChange.newRole}
            onConfirm={handleConfirmRoleChange}
            onCancel={() => setPendingChange(null)}
            submitting={submitting}
          />
        )}
      </div>
    </>
  )
}
