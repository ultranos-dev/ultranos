import { Users } from '@ultranos/ui-kit/icons'
import type { StaffingForecast } from '@/types/seasonal-planner'

interface Props { forecast: StaffingForecast }

export function StaffingForecastPanel({ forecast }: Props) {
  const gap = forecast.recommendedStaffCount - forecast.currentStaffCount
  const isUnderstaffed = gap > 0

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Users size={16} className="text-blue-500" aria-hidden="true" />
        Staffing Forecast
      </h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Current Staff" value={String(forecast.currentStaffCount)} />
        <StatCard label="Projected Tests/Day" value={String(forecast.projectedDailyTests)} />
        <StatCard label="Recommended Staff" value={String(forecast.recommendedStaffCount)} />
        <div className={`rounded-md border p-3 ${isUnderstaffed ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
          <p className="text-xs text-muted-foreground">Staff Gap</p>
          <p className={`text-lg font-semibold ${isUnderstaffed ? 'text-red-700' : 'text-green-700'}`}>
            {isUnderstaffed ? `+${gap} needed` : 'Sufficient'}
          </p>
        </div>
      </div>

      {forecast.overtimeHoursEstimate > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Estimated overtime: <strong>{forecast.overtimeHoursEstimate}h</strong> over 30 days if no additional staff is added.
        </p>
      )}

      <ul className="space-y-1">
        {forecast.shiftAdjustments.map((adj, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className="text-blue-400 mt-0.5 shrink-0">•</span>
            <span>{adj}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}
