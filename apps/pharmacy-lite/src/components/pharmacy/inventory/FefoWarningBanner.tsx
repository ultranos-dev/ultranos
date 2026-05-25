'use client'

interface FefoWarningBannerProps {
  medicationName: string
  suggestedBatch: string
  suggestedExpiry: string
}

export function FefoWarningBanner({ medicationName, suggestedBatch, suggestedExpiry }: FefoWarningBannerProps) {
  return (
    <div role="status" className="rounded-lg border border-primary-200 bg-primary-50/50 p-3" data-testid="fefo-banner">
      <p className="text-xs font-medium text-primary-800">
        FEFO: Dispensing <span className="font-semibold">{medicationName}</span> from batch{' '}
        <span className="font-mono font-semibold">{suggestedBatch}</span>{' '}
        (expires {suggestedExpiry})
      </p>
    </div>
  )
}
