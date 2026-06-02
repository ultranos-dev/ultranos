'use client'

const STATUSES = ['REQUESTED', 'APPROVED', 'ORDERED', 'SHIPPED', 'DELIVERED'] as const

interface OrderStatusPipelineProps {
  currentStatus: string
}

export function OrderStatusPipeline({ currentStatus }: OrderStatusPipelineProps) {
  const currentIdx = STATUSES.indexOf(currentStatus as any)

  return (
    <div className="flex items-center gap-1">
      {STATUSES.map((status, idx) => {
        const isComplete = idx <= currentIdx
        const isCurrent = idx === currentIdx

        return (
          <div key={status} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center rounded-full text-[10px] font-semibold px-2 py-0.5 transition-colors ${
                isCurrent
                  ? 'bg-primary text-foreground'
                  : isComplete
                    ? 'bg-success/10 text-success'
                    : 'bg-card text-muted-foreground'
              }`}
            >
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </div>
            {idx < STATUSES.length - 1 && (
              <div className={`h-0.5 w-3 ${idx < currentIdx ? 'bg-success' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function getNextStatus(current: string): string | null {
  const idx = STATUSES.indexOf(current as any)
  if (idx < 0 || idx >= STATUSES.length - 1) return null
  return STATUSES[idx + 1]
}
