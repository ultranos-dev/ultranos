import { ClipboardList } from '@ultranos/ui-kit/icons'
import type { ProtocolRecommendation, ProtocolPriority } from '@/types/seasonal-planner'

interface Props { recommendations: ProtocolRecommendation[] }

const priorityBadge: Record<ProtocolPriority, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-neutral-100 text-neutral-600',
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ProtocolRecommendationsPanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        No protocol recommendations.
      </div>
    )
  }

  const sorted = [...recommendations].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const
    return order[a.priority] - order[b.priority]
  })

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
      <h3 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
        <ClipboardList size={16} className="text-purple-500" aria-hidden="true" />
        Protocol Recommendations
      </h3>

      <ul className="space-y-3">
        {sorted.map((rec, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${priorityBadge[rec.priority]}`}>
              {rec.priority}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-700">{rec.recommendation}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {rec.category.charAt(0).toUpperCase() + rec.category.slice(1)} · Effective {fmtDate(rec.effectiveDate)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
