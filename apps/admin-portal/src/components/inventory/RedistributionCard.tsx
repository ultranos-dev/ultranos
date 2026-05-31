'use client'

interface Recommendation {
  targetLabId: string
  targetLabName: string
  sourceLabId: string
  sourceLabName: string
  reagentCategory: string
  sourceQuantity: number
}

interface RedistributionCardProps {
  recommendation: Recommendation
}

export function RedistributionCard({ recommendation }: RedistributionCardProps) {
  const { targetLabName, sourceLabName, reagentCategory, sourceQuantity } = recommendation

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-subtle">
          <AlertIcon className="h-4 w-4 text-danger" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            <span className="text-danger font-semibold">{targetLabName}</span> has 0 {reagentCategory}.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            <span className="font-medium text-success">{sourceLabName}</span> has {sourceQuantity} — recommend transfer.
          </p>
        </div>
      </div>
    </div>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  )
}
