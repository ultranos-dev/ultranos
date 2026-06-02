'use client'

import { TriangleAlert } from '@ultranos/ui-kit/icons'

interface Recommendation {
  targetLabId: string
  targetLabName: string
  sourceLabId: string
  sourceLabName: string
  reagentCategory: string
  sourceQuantity: number
  distanceKm: number | null
}

interface RedistributionCardProps {
  recommendation: Recommendation
}

export function RedistributionCard({ recommendation }: RedistributionCardProps) {
  const { targetLabName, sourceLabName, reagentCategory, sourceQuantity, distanceKm } = recommendation

  return (
    <div className="rounded-2xl border border-border bg-popover p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert className="h-4 w-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            <span className="text-destructive font-semibold">{targetLabName}</span> has 0 {reagentCategory}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-success">{sourceLabName}</span>
            {distanceKm != null ? ` (${Math.round(distanceKm)} km away)` : ''} has {sourceQuantity} — recommend transfer.
          </p>
        </div>
      </div>
    </div>
  )
}

