'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { MilestoneReviewModal } from '@/components/certifications/MilestoneReviewModal'

interface MilestoneProgress {
  progressId: string
  milestoneIndex: number
  title: string
  type: string
  requiredCount: number
  status: string
  evidenceRef: string | null
  reviewerNote: string | null
  approvedAt: string | null
  submittedAt: string | null
}

interface PathwayProgress {
  pathwayId: string
  pathwayName: string
  pathwayStatus: string
  completionPct: number
  milestones: MilestoneProgress[]
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-surface text-text-secondary',
  SUBMITTED: 'bg-warning-subtle text-warning',
  APPROVED: 'bg-success-subtle text-success',
  REJECTED: 'bg-danger-subtle text-danger',
}

function formatType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

export default function PractitionerCertificationsPage() {
  const params = useParams()
  const practitionerId = params.practitionerId as string

  const [pathways, setPathways] = useState<PathwayProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPathways, setExpandedPathways] = useState<Set<string>>(new Set())
  const [reviewMilestone, setReviewMilestone] = useState<MilestoneProgress | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [availablePathways, setAvailablePathways] = useState<Array<{ id: string; name: string }>>([])
  const [assigningPathwayId, setAssigningPathwayId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listCertificationProgress.query({
        practitionerId,
      })
      setPathways(result.pathways)
      // Auto-expand all pathways on load
      setExpandedPathways(new Set(result.pathways.map((p) => p.pathwayId)))
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load certification progress')
    } finally {
      setLoading(false)
    }
  }, [practitionerId])

  useEffect(() => {
    fetchProgress()
  }, [fetchProgress])

  function togglePathway(pathwayId: string) {
    setExpandedPathways((prev) => {
      const next = new Set(prev)
      if (next.has(pathwayId)) next.delete(pathwayId)
      else next.add(pathwayId)
      return next
    })
  }

  async function handleAssign() {
    if (!assigningPathwayId) return
    try {
      setAssigning(true)
      await trpc.admin.assignPathway.mutate({
        practitionerId,
        pathwayId: assigningPathwayId,
      })
      setShowAssignModal(false)
      setAssigningPathwayId('')
      fetchProgress()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to assign pathway')
    } finally {
      setAssigning(false)
    }
  }

  async function openAssignModal() {
    try {
      const result = await trpc.admin.listCertificationPathways.query({ status: 'ACTIVE', limit: 50 })
      setAvailablePathways(result.pathways.map((p) => ({ id: p.id, name: p.name })))
      setShowAssignModal(true)
    } catch {
      setError('Failed to load available pathways')
    }
  }

  return (
    <>
      <TopHeader title="Certification Progress" description={`Practitioner: ${practitionerId}`} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <div className="flex justify-end mb-4">
          <button
            onClick={openAssignModal}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-text-primary hover:bg-accent/90 transition-colors"
          >
            Assign Pathway
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {loading ? (
          <div className="text-text-secondary">Loading certification progress...</div>
        ) : pathways.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-text-secondary">No certification pathways assigned to this practitioner.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pathways.map((pathway) => (
              <div key={pathway.pathwayId} className="rounded-2xl border border-border overflow-hidden">
                {/* Pathway header */}
                <button
                  onClick={() => togglePathway(pathway.pathwayId)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-accent-subtle transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`h-4 w-4 text-text-secondary transition-transform ${expandedPathways.has(pathway.pathwayId) ? 'rotate-90' : ''}`}
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium text-text-primary">{pathway.pathwayName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${pathway.completionPct}%` }}
                      />
                    </div>
                    <span className="text-sm text-text-secondary">{pathway.completionPct}%</span>
                  </div>
                </button>

                {/* Milestones */}
                {expandedPathways.has(pathway.pathwayId) && (
                  <div className="divide-y divide-border bg-surface-raised">
                    {pathway.milestones.map((milestone) => (
                      <div key={milestone.progressId} className="flex items-center justify-between px-6 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-primary">{milestone.title}</p>
                          <p className="text-xs text-text-secondary">{formatType(milestone.type)} &middot; Required: {milestone.requiredCount}</p>
                          {milestone.reviewerNote && (
                            <p className="text-xs text-text-secondary mt-1 italic">Note: {milestone.reviewerNote}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[milestone.status] ?? ''}`}>
                            {milestone.status}
                          </span>
                          {milestone.status === 'SUBMITTED' && (
                            <button
                              onClick={() => setReviewMilestone(milestone)}
                              className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
                            >
                              Review
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Milestone Review Modal (Task 7) */}
      {reviewMilestone && (
        <MilestoneReviewModal
          milestone={reviewMilestone}
          onClose={() => setReviewMilestone(null)}
          onReviewed={() => {
            setReviewMilestone(null)
            fetchProgress()
          }}
        />
      )}

      {/* Assign Pathway Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAssignModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-text-primary mb-4">Assign Certification Pathway</h2>
            <select
              value={assigningPathwayId}
              onChange={(e) => setAssigningPathwayId(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent mb-4"
            >
              <option value="">Select a pathway...</option>
              {availablePathways.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-secondary hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!assigningPathwayId || assigning}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-text-primary hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
