import { FlaskConical } from '@ultranos/ui-kit/icons'
import type { ReagentForecast, ReagentForecastItem } from '@/types/seasonal-planner'

interface Props { forecast: ReagentForecast }

function rowClass(item: ReagentForecastItem): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (item.reorderDeadline && new Date(item.reorderDeadline) < today) {
    return 'bg-red-50 border-s-4 border-red-500'
  }
  if (item.projectedDepletionDate) {
    const depletionDays = Math.ceil(
      (new Date(item.projectedDepletionDate).getTime() - today.getTime()) / 86_400_000,
    )
    if (depletionDays <= 14) return 'bg-red-50 border-s-4 border-red-500'
  }
  if (item.reorderDeadline) {
    const deadlineDays = Math.ceil(
      (new Date(item.reorderDeadline).getTime() - today.getTime()) / 86_400_000,
    )
    if (deadlineDays <= 14) return 'bg-amber-50 border-s-4 border-amber-400'
  }
  return ''
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ReagentForecastPanel({ forecast }: Props) {
  if (forecast.items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No active reagent inventory found.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FlaskConical size={16} className="text-blue-500" aria-hidden="true" />
          Reagent Forecast
        </h3>
        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
          {forecast.dataSource === 'burndown_48_2' ? 'Predictive Burndown' : 'Linear Projection'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {['Reagent', 'Stock', 'Projected Use', 'Depletion', 'Expiry', 'Order By', 'Est. Cost'].map((h) => (
                <th key={h} className="text-start text-xs font-medium text-muted-foreground uppercase pb-2 border-b border-border px-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecast.items.map((item) => (
              <tr key={item.reagentId ?? item.reagentName} className={rowClass(item)}>
                <td className="py-2 px-1 border-b border-border/50 font-medium">{item.reagentName}</td>
                <td className="py-2 px-1 border-b border-border/50">{item.currentStock}</td>
                <td className="py-2 px-1 border-b border-border/50">{item.projectedConsumption}</td>
                <td className="py-2 px-1 border-b border-border/50">{fmtDate(item.projectedDepletionDate)}</td>
                <td className="py-2 px-1 border-b border-border/50">{fmtDate(item.expiryDate)}</td>
                <td className="py-2 px-1 border-b border-border/50 font-medium">{fmtDate(item.reorderDeadline)}</td>
                <td className="py-2 px-1 border-b border-border/50">
                  {item.estimatedCost != null ? `${item.estimatedCost.toFixed(0)} AFN` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
