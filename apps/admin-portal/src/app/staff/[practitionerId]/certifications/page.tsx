'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { MilestoneReviewModal } from '@/components/certifications/MilestoneReviewModal'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_VARIANTS: Record<string, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  PENDING: 'secondary',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
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
  const [issuingPathway, setIssuingPathway] = useState<string | null>(null)

  async function handleIssueCredential(pathwayId: string) {
    try {
      setIssuingPathway(pathwayId)
      await trpc.admin.issueCredential.mutate({
        practitionerId,
        pathwayId,
      })
      fetchProgress()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to issue credential')
    } finally {
      setIssuingPathway(null)
    }
  }

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
          <Button onClick={openAssignModal}>
            Assign Pathway
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="text-muted-foreground">Loading certification progress...</div>
        ) : pathways.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No certification pathways assigned to this practitioner.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pathways.map((pathway) => (
              <div key={pathway.pathwayId} className="rounded-2xl border border-border overflow-hidden">
                {/* Pathway header */}
                <button
                  onClick={() => togglePathway(pathway.pathwayId)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <DirectionalIcon category="navigation">
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground transition-transform ${expandedPathways.has(pathway.pathwayId) ? 'rotate-90' : ''}`}
                      />
                    </DirectionalIcon>
                    <span className="font-medium text-foreground">{pathway.pathwayName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 rounded-full bg-card overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pathway.completionPct}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">{pathway.completionPct}%</span>
                  </div>
                </button>

                {/* Issue Credential button — AC #5 */}
                {pathway.completionPct === 100 && (
                  <div className="px-4 py-2 bg-card border-t border-border flex justify-end">
                    <Button
                      variant="success"
                      onClick={() => handleIssueCredential(pathway.pathwayId)}
                      disabled={issuingPathway === pathway.pathwayId}
                    >
                      {issuingPathway === pathway.pathwayId ? 'Issuing...' : 'Issue Credential'}
                    </Button>
                  </div>
                )}

                {/* Milestones */}
                {expandedPathways.has(pathway.pathwayId) && (
                  <div className="divide-y divide-border bg-popover">
                    {pathway.milestones.map((milestone) => (
                      <div key={milestone.progressId} className="flex items-center justify-between px-6 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{milestone.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatType(milestone.type)} &middot; Required: {milestone.requiredCount}
                            {milestone.submittedAt && <> &middot; Submitted: {formatDate(milestone.submittedAt)}</>}
                            {milestone.approvedAt && <> &middot; Approved: {formatDate(milestone.approvedAt)}</>}
                          </p>
                          {milestone.reviewerNote && (
                            <p className="text-xs text-muted-foreground mt-1 italic">Note: {milestone.reviewerNote}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={STATUS_VARIANTS[milestone.status] ?? 'secondary'}>
                            {milestone.status}
                          </Badge>
                          {milestone.status === 'SUBMITTED' && (
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => setReviewMilestone(milestone)}
                            >
                              Review
                            </Button>
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
            className="w-full max-w-md rounded-2xl border border-border bg-popover p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">Assign Certification Pathway</h2>
            <select
              value={assigningPathwayId}
              onChange={(e) => setAssigningPathwayId(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
            >
              <option value="">Select a pathway...</option>
              {availablePathways.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowAssignModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!assigningPathwayId || assigning}
              >
                {assigning ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
