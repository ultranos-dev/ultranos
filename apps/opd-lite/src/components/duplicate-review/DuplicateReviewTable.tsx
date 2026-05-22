'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CandidateComparisonCard, type DuplicateCandidate } from './CandidateComparisonCard'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ReviewDecision = 'PENDING' | 'DISMISSED' | 'FLAGGED_FOR_MERGE'

interface DuplicateReviewRow {
  id: string
  /** Display label for the source patient (given name only — no PHI in logs). */
  patientLabel: string
  sourcePatientId: string
  candidates: DuplicateCandidate[]
  /** Highest MPI score among candidates. */
  topScore: number
  decision: ReviewDecision
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Hub API helpers (placeholder — swap for tRPC client when wired)    */
/* ------------------------------------------------------------------ */

function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

async function fetchDuplicateReviews(): Promise<DuplicateReviewRow[]> {
  // TODO: Replace with trpc.duplicateReview.list.useQuery()
  const url = `${getHubApiUrl()}/duplicateReview.list?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = (await res.json()) as {
    result: { data: { json: DuplicateReviewRow[] } }
  }
  return body.result.data.json
}

async function submitDecision(
  reviewId: string,
  decision: 'DISMISSED' | 'FLAGGED_FOR_MERGE'
): Promise<void> {
  // TODO: Replace with trpc.duplicateReview.decide.useMutation()
  const url = `${getHubApiUrl()}/duplicateReview.decide`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { reviewId, decision } }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DuplicateReviewTable() {
  const t = useTranslations('duplicateReview')

  const [rows, setRows] = useState<DuplicateReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  const loadRows = useCallback(async () => {
    try {
      const data = await fetchDuplicateReviews()
      setRows(data)
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

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  /* ---- Loading / Error states ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <span className="text-sm text-neutral-500">{t('loading')}</span>
      </div>
    )
  }

  if (error && rows.length === 0) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{t('noReviews')}</p>
    )
  }

  /* ---- Table ---- */

  return (
    <div>
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <th className="px-4 py-3 text-start font-semibold">{t('colPatient')}</th>
              <th className="px-4 py-3 text-start font-semibold">{t('colScore')}</th>
              <th className="px-4 py-3 text-start font-semibold">{t('colDecision')}</th>
              <th className="px-4 py-3 text-start font-semibold">{t('colStatus')}</th>
              <th className="px-4 py-3 text-end font-semibold">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedId === row.id
              const isPending = row.decision === 'PENDING'
              const isBusy = actioning === row.id

              return (
                <TableRow
                  key={row.id}
                  row={row}
                  isExpanded={isExpanded}
                  isPending={isPending}
                  isBusy={isBusy}
                  onToggle={() => toggleExpand(row.id)}
                  onDismiss={() => handleDecision(row.id, 'DISMISSED')}
                  onFlag={() => handleDecision(row.id, 'FLAGGED_FOR_MERGE')}
                  t={t}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Table Row (extracted for readability)                               */
/* ------------------------------------------------------------------ */

interface TableRowProps {
  row: DuplicateReviewRow
  isExpanded: boolean
  isPending: boolean
  isBusy: boolean
  onToggle: () => void
  onDismiss: () => void
  onFlag: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}

function TableRow({
  row,
  isExpanded,
  isPending,
  isBusy,
  onToggle,
  onDismiss,
  onFlag,
  t,
}: TableRowProps) {
  const decisionBadge: Record<ReviewDecision, { label: string; classes: string }> = {
    PENDING: { label: t('decisionPending'), classes: 'bg-amber-100 text-amber-800' },
    DISMISSED: { label: t('decisionDismissed'), classes: 'bg-neutral-100 text-neutral-600' },
    FLAGGED_FOR_MERGE: { label: t('decisionFlagged'), classes: 'bg-blue-100 text-blue-800' },
  }

  const badge = decisionBadge[row.decision]

  return (
    <>
      <tr
        className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
        onClick={onToggle}
        aria-expanded={isExpanded}
        role="row"
      >
        <td className="px-4 py-3 font-medium text-neutral-900">{row.patientLabel}</td>
        <td className="px-4 py-3 text-neutral-700">{row.topScore}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${badge.classes}`}>
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-neutral-500 text-xs">{row.createdAt}</td>
        <td className="px-4 py-3 text-end">
          {isPending && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  onDismiss()
                }}
                className="min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 disabled:opacity-50"
                aria-label={t('dismissAriaLabel', { patient: row.patientLabel })}
              >
                {t('actionDismiss')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  onFlag()
                }}
                className="min-h-[44px] rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
                aria-label={t('flagAriaLabel', { patient: row.patientLabel })}
              >
                {t('actionFlagMerge')}
              </button>
            </div>
          )}
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-neutral-50 px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {row.candidates.map((candidate) => (
                <CandidateComparisonCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
