'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { LabRole } from '@ultranos/shared-types'

const LAB_ROLES: { value: LabRole; label: string }[] = [
  { value: LabRole.LAB_TECH, label: 'Lab Tech' },
  { value: LabRole.SENIOR_TECH, label: 'Senior Tech' },
  { value: LabRole.SUPERVISOR, label: 'Supervisor' },
  { value: LabRole.LAB_MANAGER, label: 'Lab Manager' },
]

interface LabOption {
  id: string
  labName: string
}

interface PractitionerOption {
  id: string
  name: string
  email: string
}

interface AssignStaffModalProps {
  /** Pre-fills and locks the lab field. Use from the per-lab staff page. */
  fixedLabId?: string
  /** Available labs for the dropdown. Use from the org-wide tab. */
  labs?: LabOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned: () => void
}

export default function AssignStaffModal({
  fixedLabId,
  labs,
  open,
  onOpenChange,
  onAssigned,
}: AssignStaffModalProps) {
  const [selectedLabId, setSelectedLabId] = useState(fixedLabId ?? '')
  const [selectedPractitionerId, setSelectedPractitionerId] = useState('')
  const [selectedRole, setSelectedRole] = useState<LabRole>(LabRole.LAB_TECH)
  const [practitioners, setPractitioners] = useState<PractitionerOption[]>([])
  const [loadingPractitioners, setLoadingPractitioners] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load active + pending-invite org users when the dialog opens
  useEffect(() => {
    if (!open) return
    setLoadingPractitioners(true)
    trpc.admin.listUsers.query({ cursor: 0, limit: 100, status: 'ALL' })
      .then((result: { users: Array<{ id: string; name: string; email: string; status: string }> }) => {
        const sorted = result.users
          .filter((u: { status: string }) => u.status === 'ACTIVE' || u.status === 'PENDING_INVITE')
          .map((u: { id: string; name: string; email: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          }))
          .sort((a: PractitionerOption, b: PractitionerOption) => a.name.localeCompare(b.name))
        setPractitioners(sorted)
      })
      .catch(() => {
        // Non-critical; dropdown stays empty, user sees error via empty state
      })
      .finally(() => setLoadingPractitioners(false))
  }, [open])

  const canSubmit = selectedLabId !== '' && selectedPractitionerId !== '' && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.assignStaffToLab.mutate({
        labId: selectedLabId,
        practitionerId: selectedPractitionerId,
        initialRole: selectedRole,
      })
      onAssigned()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to assign staff')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Staff to Lab</DialogTitle>
          <DialogDescription className="sr-only">Assign a practitioner to a lab with an initial role</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Lab selector — only shown in org-wide context */}
          {!fixedLabId && labs && (
            <div>
              <label
                htmlFor="assign-lab-select"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                Lab
              </label>
              <select
                id="assign-lab-select"
                aria-label="Lab"
                value={selectedLabId}
                onChange={(e) => setSelectedLabId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a lab…</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.labName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Practitioner dropdown */}
          <div>
            <label
              htmlFor="assign-practitioner-select"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              Practitioner
            </label>
            <select
              id="assign-practitioner-select"
              aria-label="Practitioner"
              value={selectedPractitionerId}
              onChange={(e) => setSelectedPractitionerId(e.target.value)}
              disabled={loadingPractitioners}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">
                {loadingPractitioners ? 'Loading…' : 'Select a practitioner…'}
              </option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.email}
                </option>
              ))}
            </select>
          </div>

          {/* Role selector */}
          <div>
            <label
              htmlFor="assign-role-select"
              className="block text-sm font-medium text-muted-foreground mb-1"
            >
              Initial role
            </label>
            <select
              id="assign-role-select"
              aria-label="Initial role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as LabRole)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LAB_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
