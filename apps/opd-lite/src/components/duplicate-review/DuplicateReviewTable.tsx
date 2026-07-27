'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { UserSearch } from '@ultranos/ui-kit/icons'
import { getHubApiUrl, getAuthHeaders } from '@/lib/hub-auth'
import { CandidateComparisonCard, type DuplicateCandidate } from './CandidateComparisonCard'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ReviewDecision = 'PENDING' | 'DISMISSED' | 'FLAGGED_FOR_MERGE'

interface DuplicateReviewRow {
  id: string
  /** Display label for the source patient (given name only -- no PHI in logs). */
  patientLabel: string
  sourcePatientId: string
  candidates: DuplicateCandidate[]
  /** Highest MPI score among candidates. */
  topScore: number
  decision: ReviewDecision
  createdAt: string
}

async function fetchDuplicateReviews(): Promise<DuplicateReviewRow[]> {
  const headers = await getAuthHeaders()
  const url = `${getHubApiUrl()}/duplicateReview.list?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`
  const res = await fetch(url, { method: 'GET', headers })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = (await res.json()) as unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (body as any)?.result?.data?.json
  if (!Array.isArray(rows)) throw new Error('Unexpected response shape from Hub API')
  return rows as DuplicateReviewRow[]
}

async function submitDecision(
  reviewId: string,
  decision: 'DISMISSED' | 'FLAGGED_FOR_MERGE'
): Promise<void> {
  const headers = await getAuthHeaders()
  const url = `${getHubApiUrl()}/duplicateReview.decide`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: { reviewId, decision } }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
}

/* ------------------------------------------------------------------ */
/*  Decision badge config                                              */
/* ------------------------------------------------------------------ */

const decisionBadgeConfig: Record<ReviewDecision, { labelKey: string; classes: string }> = {
  PENDING: { labelKey: 'decisionPending', classes: 'bg-warning/20 text-warning' },
  DISMISSED: { labelKey: 'decisionDismissed', classes: 'bg-muted text-muted-foreground' },
  FLAGGED_FOR_MERGE: { labelKey: 'decisionFlagged', classes: 'bg-primary text-primary-foreground' },
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DuplicateReviewTable() {
  const t = useTranslations('duplicateReview')

  const [rows, setRows] = useState<DuplicateReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // selectedId replaces expandedId -- tracks the selected review in the master list
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  const loadRows = useCallback(async () => {
    try {
      const data = await fetchDuplicateReviews()
      setRows(data)
      // Auto-select the first row for a better master-detail default experience
      const first = data[0]
      if (first !== undefined) {
        setSelectedId(first.id)
      }
      setError(null)
    } catch {
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const handleDecision = async (
    reviewId: string,
    decision: 'DISMISSED' | 'FLAGGED_FOR_MERGE'
  ) => {
    setActioning(reviewId)
    try {
      await submitDecision(reviewId, decision)
      // Optimistically update the row
      setRows((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, decision } : r))
      )
    } catch {
      setError(t('actionError'))
    } finally {
      setActioning(null)
    }
  }

  /* ---- Loading / Error states ---- */

  if (loading) {
    return (
      <div className="space-y-2" aria-label={t('loading')} aria-busy="true">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    )
  }

  if (error && rows.length === 0) {
    return (
      <Alert variant="destructive" role="alert">
        {error}
      </Alert>
    )
  }

  if (rows.length === 0) {
    return <EmptyState title={t('noReviews')} />
  }

  /* ---- Two-pane master-detail ---- */

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null

  return (
    <div>
      {error && (
        <Alert variant="destructive" role="alert" className="mb-4">
          {error}
        </Alert>
      )}

      {/*
        lg+: side-by-side grid (list-left | detail-right)
        <lg: single column (list on top, detail below)
      */}
      <div className="lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-4 lg:items-start">

        {/* ---- LEFT PANE: compact selectable list ---- */}
        <div className="overflow-hidden rounded-xl ring-[0.65px] ring-border/50">
          <ul
            role="listbox"
            aria-label={t('reviewListLabel')}
            className="divide-y divide-border"
          >
            {rows.map((row) => {
              const isSelected = selectedId === row.id
              const isPending = row.decision === 'PENDING'
              const cfg = decisionBadgeConfig[row.decision]

              return (
                <li key={row.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-disabled={!isPending ? true : undefined}
                    onClick={() => setSelectedId(row.id)}
                    className={[
                      'w-full px-4 py-3 text-start flex items-center justify-between gap-3 transition-colors',
                      isSelected ? 'bg-muted' : 'hover:bg-muted/60',
                      !isPending ? 'text-muted-foreground' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={`flex-1 font-medium truncate${isPending ? ' text-foreground' : ''}`}>
                      {row.patientLabel}
                    </span>
                    <span className="tabular-nums text-sm shrink-0">{row.topScore}</span>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.classes}`}
                    >
                      {t(cfg.labelKey)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* ---- RIGHT PANE: detail for selected review ---- */}
        <div
          className="mt-4 lg:mt-0"
          aria-label={t('reviewDetailLabel')}
        >
          {selectedRow === null ? (
            <EmptyState
              icon={UserSearch}
              title={t('selectPrompt')}
            />
          ) : (
            <div className="rounded-xl ring-[0.65px] ring-border/50 p-4 flex flex-col gap-4">
              {selectedRow.candidates.length === 0 ? (
                <EmptyState size="sm" icon={UserSearch} title={t('noCandidates')} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {selectedRow.candidates.map((candidate) => (
                    <CandidateComparisonCard key={candidate.id} candidate={candidate} />
                  ))}
                </div>
              )}

              {selectedRow.decision === 'PENDING' && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    disabled={actioning === selectedRow.id}
                    type="button"
                    onClick={() => handleDecision(selectedRow.id, 'DISMISSED')}
                    aria-label={t('dismissAriaLabel', { patient: selectedRow.patientLabel })}
                  >
                    {t('actionDismiss')}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={actioning === selectedRow.id}
                    type="button"
                    onClick={() => handleDecision(selectedRow.id, 'FLAGGED_FOR_MERGE')}
                    aria-label={t('flagAriaLabel', { patient: selectedRow.patientLabel })}
                  >
                    {t('actionFlagMerge')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
