'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Lab {
  labId: string
  labName: string
}

interface ChwEnrollmentModalProps {
  labs: Lab[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ChwEnrollmentModal({ labs, open, onOpenChange, onSuccess }: ChwEnrollmentModalProps) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [assignedLabId, setAssignedLabId] = useState(labs[0]?.labId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const phoneValid = /^\+?[0-9\s\-()]{7,20}$/.test(phone)
  const isValid = fullName.trim().length > 0 && phoneValid && assignedLabId

  async function handleSubmit() {
    try {
      setSubmitting(true)
      setError(null)
      const result = await trpc.admin.enrollChw.mutate({
        fullName: fullName.trim(),
        phone: phone.trim(),
        assignedLabId,
      })
      setCreatedId(result.chwId)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to enroll CHW')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll Community Health Worker</DialogTitle>
          <DialogDescription className="sr-only">Enroll a new community health worker and assign them to a collection point.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {createdId ? (
          <div>
            <div className="rounded-xl bg-success/10 border border-success/20 p-4 text-sm text-success">
              <p className="font-semibold">CHW enrolled successfully</p>
              <p className="mt-1">
                CHW ID: <code className="rounded bg-success/10 px-2 py-0.5 font-mono text-xs">{createdId}</code>
              </p>
            </div>
            <DialogFooter className="mt-4">
              <Button
                onClick={() => {
                  setCreatedId(null)
                  setFullName('')
                  setPhone('')
                  setError(null)
                }}
              >
                Enroll Another
              </Button>
              <Button variant="outline" onClick={() => { onSuccess(); onOpenChange(false) }}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {/* Full Name */}
            <div>
              <label htmlFor="chw-name" className="block text-sm font-medium text-foreground">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="chw-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="chw-phone" className="block text-sm font-medium text-foreground">
                Phone Number <span className="text-destructive">*</span>
              </label>
              <Input
                id="chw-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+93 700 000 000"
                className="mt-1"
              />
              {phone.length > 0 && !phoneValid && (
                <p className="mt-1 text-xs text-destructive">Invalid phone format</p>
              )}
            </div>

            {/* Assigned Collection Point */}
            <div>
              <label htmlFor="chw-lab" className="block text-sm font-medium text-foreground">
                Assigned Collection Point <span className="text-destructive">*</span>
              </label>
              <select
                id="chw-lab"
                value={assignedLabId}
                onChange={(e) => setAssignedLabId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {labs.map((lab) => (
                  <option key={lab.labId} value={lab.labId}>{lab.labName}</option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
              >
                {submitting ? 'Enrolling...' : 'Enroll CHW'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
