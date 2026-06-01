'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, FlaskConical, Users, Zap, ClipboardList } from '@ultranos/ui-kit/icons'
import type { ActionableDeadline, DeadlineCategory, DeadlineUrgency } from '@/types/seasonal-planner'

interface Props {
  deadlines: ActionableDeadline[]
  onAction: (id: string, notes: string) => void
}

const urgencyBadge: Record<DeadlineUrgency, string> = {
  critical: 'bg-red-100 text-red-700',
  important: 'bg-amber-100 text-amber-700',
  routine: 'bg-green-100 text-green-700',
}

function CategoryIcon({ category }: { category: DeadlineCategory }) {
  switch (category) {
    case 'reagent': return <FlaskConical size={14} className="text-blue-400" aria-hidden="true" />
    case 'staffing': return <Users size={14} className="text-blue-400" aria-hidden="true" />
    case 'power': return <Zap size={14} className="text-yellow-500" aria-hidden="true" />
    case 'protocol': return <ClipboardList size={14} className="text-purple-400" aria-hidden="true" />
  }
}

function countdown(deadlineDate: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dl = new Date(deadlineDate)
  dl.setHours(0, 0, 0, 0)
  const days = Math.round((dl.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'Due today'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  return `in ${days} day${days === 1 ? '' : 's'}`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function DeadlineItem({
  deadline,
  onAction,
}: {
  deadline: ActionableDeadline
  onAction: (id: string, notes: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')

  const isActioned = Boolean(deadline.actionedAt)

  return (
    <li className={`rounded-md border p-3 ${isActioned ? 'opacity-50 bg-neutral-50 border-neutral-200' : 'bg-white border-neutral-200'}`}>
      <div className="flex items-start gap-2">
        <CategoryIcon category={deadline.category} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {deadline.isOverdue && !isActioned && (
              <span className="text-xs font-bold text-red-600 uppercase tracking-wide">OVERDUE</span>
            )}
            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${urgencyBadge[deadline.urgency]}`}>
              {deadline.urgency}
            </span>
            <span className="text-xs text-neutral-400 capitalize">{deadline.category}</span>
          </div>
          <p className="text-sm text-neutral-800 font-medium">{deadline.action}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {fmtDate(deadline.deadlineDate)} ·{' '}
            <span className={deadline.isOverdue && !isActioned ? 'text-red-600 font-medium' : ''}>
              {countdown(deadline.deadlineDate)}
            </span>
          </p>
          {deadline.notes && (
            <p className="text-xs text-neutral-400 mt-1">{deadline.notes}</p>
          )}
          {isActioned && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle size={12} aria-hidden="true" />
              Actioned {deadline.actionedAt ? fmtDate(deadline.actionedAt) : ''}
              {deadline.actionedNotes && ` — ${deadline.actionedNotes}`}
            </p>
          )}
        </div>
        {!isActioned && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 text-xs text-blue-600 hover:underline"
            aria-expanded={open}
          >
            {open ? 'Cancel' : 'Mark Actioned'}
          </button>
        )}
      </div>

      {open && !isActioned && (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Action notes"
          />
          <button
            onClick={() => { onAction(deadline.id, notes); setOpen(false) }}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Confirm Actioned
          </button>
        </div>
      )}
    </li>
  )
}

export function DeadlinesPanel({ deadlines, onAction }: Props) {
  if (deadlines.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        No upcoming deadlines.
      </div>
    )
  }

  // Sort: overdue + unactioned first, then by date, then actioned last
  const sorted = [...deadlines].sort((a, b) => {
    const aActioned = Boolean(a.actionedAt)
    const bActioned = Boolean(b.actionedAt)
    if (aActioned && !bActioned) return 1
    if (!aActioned && bActioned) return -1
    if (a.isOverdue && !b.isOverdue) return -1
    if (!a.isOverdue && b.isOverdue) return 1
    return a.deadlineDate.localeCompare(b.deadlineDate)
  })

  const overdueCount = deadlines.filter((d) => d.isOverdue && !d.actionedAt).length

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
      <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-500" aria-hidden="true" />
        Action Deadlines
        {overdueCount > 0 && (
          <span className="ms-auto rounded-full bg-red-500 text-white text-xs font-bold px-2 py-0.5">
            {overdueCount} overdue
          </span>
        )}
      </h3>

      <ul className="space-y-2">
        {sorted.map((d) => (
          <DeadlineItem key={d.id} deadline={d} onAction={onAction} />
        ))}
      </ul>
    </div>
  )
}
