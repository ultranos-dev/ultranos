'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Trash2 } from '@ultranos/ui-kit/icons'

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
  onClose: () => void
  onCreated: () => void
}

export function PathwayCreateModal({ onClose, onCreated }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-popover p-6 shadow-card max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Create Certification Pathway</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
              <button
                type="button"
                onClick={addMilestone}
                className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                + Add Milestone
              </button>
            </div>

            <div className="space-y-3">
              {milestones.map((milestone, index) => (
                <div key={index} className="flex gap-2 items-start p-3 rounded-xl bg-card border border-border">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                      className="w-full rounded-lg border border-border bg-popover px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                      <input
                        type="number"
                        min={1}
                        value={milestone.required_count}
                        onChange={(e) => updateMilestone(index, 'required_count', parseInt(e.target.value) || 1)}
                        className="w-20 rounded-lg border border-border bg-popover px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        title="Required count"
                      />
                    </div>
                  </div>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      className="mt-1 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground hover:bg-card transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Pathway'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
