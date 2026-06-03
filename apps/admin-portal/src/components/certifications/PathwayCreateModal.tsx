'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Trash2 } from '@ultranos/ui-kit/icons'
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

type MilestoneType = 'MODULE_COMPLETION' | 'SUPERVISED_PROCEDURE' | 'ASSESSMENT_PASS' | 'CONTINUING_ED_HOURS'

interface MilestoneRow {
  title: string
  type: MilestoneType
  required_count: number
}

const MILESTONE_TYPES: { value: MilestoneType; label: string }[] = [
  { value: 'MODULE_COMPLETION', label: 'Module Completion' },
  { value: 'SUPERVISED_PROCEDURE', label: 'Supervised Procedure' },
  { value: 'ASSESSMENT_PASS', label: 'Assessment Pass' },
  { value: 'CONTINUING_ED_HOURS', label: 'Continuing Ed Hours' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function PathwayCreateModal({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    { title: '', type: 'MODULE_COMPLETION', required_count: 1 },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addMilestone() {
    setMilestones([...milestones, { title: '', type: 'MODULE_COMPLETION', required_count: 1 }])
  }

  function removeMilestone(index: number) {
    if (milestones.length <= 1) return
    setMilestones(milestones.filter((_, i) => i !== index))
  }

  function updateMilestone(index: number, field: keyof MilestoneRow, value: string | number) {
    const updated = [...milestones]
    updated[index] = { ...updated[index], [field]: value }
    setMilestones(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const validMilestones = milestones.filter((m) => m.title.trim())
    if (validMilestones.length === 0) {
      setError('At least one milestone with a title is required')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.createCertificationPathway.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        milestones: validMilestones,
      })
      onCreated()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create pathway')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Certification Pathway</DialogTitle>
          <DialogDescription className="sr-only">Create a new certification pathway with milestones.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Name *</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lab Technician Level 1"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Describe the certification pathway..."
            />
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-muted-foreground">Milestones *</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addMilestone}
                className="text-xs font-medium"
              >
                + Add Milestone
              </Button>
            </div>

            <div className="space-y-3">
              {milestones.map((milestone, index) => (
                <div key={index} className="flex gap-2 items-start p-3 rounded-xl bg-card border border-border">
                  <div className="flex-1 space-y-2">
                    <Input
                      type="text"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                      className="h-8 rounded-lg px-3 py-1.5 text-sm"
                      placeholder="Milestone title"
                    />
                    <div className="flex gap-2">
                      <select
                        value={milestone.type}
                        onChange={(e) => updateMilestone(index, 'type', e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-popover px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {MILESTONE_TYPES.map((mt) => (
                          <option key={mt.value} value={mt.value}>{mt.label}</option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={1}
                        value={milestone.required_count}
                        onChange={(e) => updateMilestone(index, 'required_count', parseInt(e.target.value) || 1)}
                        className="w-20 h-8 rounded-lg px-3 py-1.5 text-sm"
                        title="Required count"
                      />
                    </div>
                  </div>
                  {milestones.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMilestone(index)}
                      className="mt-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label="Remove milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Pathway'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
