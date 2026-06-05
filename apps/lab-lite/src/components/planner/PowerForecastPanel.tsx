import { Zap } from '@ultranos/ui-kit/icons'
import type { PowerForecast } from '@/types/seasonal-planner'

interface Props { forecast: PowerForecast }

export function PowerForecastPanel({ forecast }: Props) {
  if (forecast.estimatedAnalyzerHours === 0 && forecast.recommendations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No power forecast data available.
      </div>
    )
  }

  const solarCoverage = forecast.solarAvailabilityHours !== null
    ? Math.min(100, Math.round((forecast.solarAvailabilityHours / Math.max(forecast.estimatedAnalyzerHours, 1)) * 100))
    : 0

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Zap size={16} className="text-yellow-500" aria-hidden="true" />
        Power Forecast
      </h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Analyzer Hours Needed" value={`${forecast.estimatedAnalyzerHours}h`} />
        <StatCard label="Generator Fuel Needed" value={`${forecast.generatorFuelNeeded}L`} />
        {forecast.solarAvailabilityHours !== null && (
          <StatCard label="Solar Availability" value={`${forecast.solarAvailabilityHours}h`} />
        )}
      </div>

      {forecast.solarAvailabilityHours !== null && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Power coverage (solar vs generator)</p>
          <div className="relative h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 start-0 bg-yellow-400 rounded-full"
              style={{ width: `${solarCoverage}%` }}
              aria-label={`Solar covers ${solarCoverage}% of analyzer load`}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />Solar</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-muted" />Generator</span>
          </div>
        </div>
      )}

      <ul className="space-y-1">
        {forecast.recommendations.map((rec, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className="text-yellow-500 mt-0.5 shrink-0">•</span>
            <span>{rec}</span>
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
