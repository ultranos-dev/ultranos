'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Lab {
  labId: string
  labName: string
}

interface ChwEnrollmentModalProps {
  labs: Lab[]
  onClose: () => void
  onSuccess: () => void
}

export function ChwEnrollmentModal({ labs, onClose, onSuccess }: ChwEnrollmentModalProps) {
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to enroll CHW')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">Enroll Community Health Worker</h2>

        {error && (
          <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {createdId ? (
          <div className="mt-4">
            <div className="rounded-xl bg-success/10 border border-success/20 p-4 text-sm text-success">
              <p className="font-semibold">CHW enrolled successfully</p>
              <p className="mt-1">
                CHW ID: <code className="rounded bg-success/10 px-2 py-0.5 font-mono text-xs">{createdId}</code>
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
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
              <Button variant="outline" onClick={() => { onSuccess(); onClose() }}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Full Name */}
            <div className="mt-4">
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
            <div className="mt-4">
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
            <div className="mt-4">
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

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
              >
                {submitting ? 'Enrolling...' : 'Enroll CHW'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
