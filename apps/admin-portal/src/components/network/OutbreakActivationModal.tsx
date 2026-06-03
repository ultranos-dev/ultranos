'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
  status: string
}

interface OutbreakActivationModalProps {
  labs: Lab[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function OutbreakActivationModal({ labs, open, onOpenChange, onSuccess }: OutbreakActivationModalProps) {
  const [pathogen, setPathogen] = useState('')
  const [selectedLabs, setSelectedLabs] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleLab(labId: string) {
    setSelectedLabs((prev) => {
      const next = new Set(prev)
      if (next.has(labId)) next.delete(labId)
      else next.add(labId)
      return next
    })
  }

  const isFormValid = pathogen.trim().length > 0 && selectedLabs.size > 0

  async function handleSubmit() {
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.activateOutbreakMode.mutate({
        pathogen: pathogen.trim(),
        affectedLabIds: Array.from(selectedLabs),
        notes: notes.trim() || undefined,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to activate outbreak mode')
      setStep('form')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate Outbreak Mode</DialogTitle>
          <DialogDescription className="sr-only">Activate outbreak mode for a pathogen across selected labs.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {step === 'form' && (
          <>
            {/* Pathogen */}
            <div>
              <label htmlFor="outbreak-pathogen" className="block text-sm font-medium text-foreground">
                Target Pathogen <span className="text-destructive">*</span>
              </label>
              <Input
                id="outbreak-pathogen"
                type="text"
                value={pathogen}
                onChange={(e) => setPathogen(e.target.value)}
                placeholder="e.g. Cholera, Measles, COVID-19"
                className="mt-1"
              />
            </div>

            {/* Affected Labs */}
            <div>
              <span className="block text-sm font-medium text-foreground">
                Affected Labs <span className="text-destructive">*</span>
              </span>
              <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
                {labs.map((lab) => (
                  <label
                    key={lab.labId}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      selectedLabs.has(lab.labId)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-card'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLabs.has(lab.labId)}
                      onChange={() => toggleLab(lab.labId)}
                      className="accent-accent"
                    />
                    <span className="text-sm font-medium text-foreground">{lab.labName}</span>
                    <Badge
                      variant={
                        lab.status === 'ACTIVE' ? 'success'
                          : lab.status === 'PENDING' ? 'warning'
                          : 'destructive'
                      }
                      className="ms-auto"
                    >
                      {lab.status}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="outbreak-notes" className="block text-sm font-medium text-foreground">
                Notes (optional)
              </label>
              <Textarea
                id="outbreak-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1"
                placeholder="Additional context..."
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep('confirm')}
                disabled={!isFormValid}
              >
                Review
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
              <p className="font-semibold">You are about to activate outbreak mode for {pathogen} at {selectedLabs.size} lab{selectedLabs.size > 1 ? 's' : ''}.</p>
              <p className="mt-1">All staff at these labs will be notified. Proceed?</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('form')}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Activating...' : 'Activate Outbreak Mode'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
