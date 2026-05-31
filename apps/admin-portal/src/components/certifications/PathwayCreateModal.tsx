'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'

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
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-surface-raised p-6 shadow-card max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-text-primary mb-4">Create Certification Pathway</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g. Lab Technician Level 1"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              placeholder="Describe the certification pathway..."
            />
          </div>

          {/* Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-text-secondary">Milestones *</label>
              <button
                type="button"
                onClick={addMilestone}
                className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
              >
                + Add Milestone
              </button>
            </div>

            <div className="space-y-3">
              {milestones.map((milestone, index) => (
                <div key={index} className="flex gap-2 items-start p-3 rounded-xl bg-surface border border-border">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Milestone title"
                    />
                    <div className="flex gap-2">
                      <select
                        value={milestone.type}
                        onChange={(e) => updateMilestone(index, 'type', e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
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
                        className="w-20 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                        title="Required count"
                      />
                    </div>
                  </div>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      className="mt-1 text-text-secondary hover:text-danger transition-colors"
                      aria-label="Remove milestone"
                    >
                      <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-text-primary hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Pathway'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
