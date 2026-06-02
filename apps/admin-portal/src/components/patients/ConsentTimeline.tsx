'use client'

interface ConsentTimelineProps {
  patientId: string
}

export function ConsentTimeline({ patientId }: ConsentTimelineProps) {
  return (
    <div className="rounded-3xl bg-white p-5 border border-border">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        <span className="wavy-divider">Consent Timeline</span>
      </h2>
      <div className="mt-4 rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Consent Timeline — coming soon
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chronological consent records for patient {patientId.slice(0, 8)}... will be displayed here once the consent list endpoint is available.
        </p>
      </div>
    </div>
  )
}
