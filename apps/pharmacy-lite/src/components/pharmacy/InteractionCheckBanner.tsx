'use client'

type InteractionStatus =
  | { state: 'checking' }
  | { state: 'clear' }
  | { state: 'warning'; interactions: string[] }
  | { state: 'contraindicated'; interactions: string[] }
  | { state: 'unavailable'; reason: string }

interface InteractionCheckBannerProps {
  status: InteractionStatus
}

/**
 * SAFETY-CRITICAL: Per CLAUDE.md rule #3, if the drug interaction check fails,
 * the UI must show "Interaction check unavailable." Never default to
 * "no interactions found" on failure.
 */
export function InteractionCheckBanner({ status }: InteractionCheckBannerProps) {
  switch (status.state) {
    case 'checking':
      return (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-center" data-testid="interaction-checking">
          <p className="text-sm text-neutral-600">Checking drug interactions...</p>
        </div>
      )

    case 'clear':
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3" data-testid="interaction-clear">
          <p className="text-sm font-medium text-green-800">No known drug interactions detected.</p>
        </div>
      )

    case 'warning':
      return (
        <div role="alert" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4" data-testid="interaction-warning">
          <p className="text-sm font-bold text-amber-800 mb-2">Drug Interaction Warning</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm text-amber-700">&bull; {interaction}</li>
            ))}
          </ul>
        </div>
      )

    case 'contraindicated':
      return (
        <div role="alert" className="rounded-lg border-2 border-red-500 bg-red-50 p-4" data-testid="interaction-contraindicated">
          <p className="text-sm font-bold text-red-800 uppercase mb-2">CONTRAINDICATION DETECTED</p>
          <ul className="space-y-1">
            {status.interactions.map((interaction, i) => (
              <li key={i} className="text-sm font-semibold text-red-700">&bull; {interaction}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-red-700 font-medium">
            Dispensing is blocked. Contact prescribing physician for alternatives.
          </p>
        </div>
      )

    case 'unavailable':
      return (
        <div role="alert" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-4" data-testid="interaction-unavailable">
          <p className="text-sm font-bold text-amber-900">
            Interaction check unavailable
          </p>
          <p className="text-xs text-amber-700 mt-1">{status.reason}</p>
          <p className="text-xs font-semibold text-amber-800 mt-2">
            Proceed with caution. Manually verify drug interactions before dispensing.
          </p>
        </div>
      )
  }
}

export type { InteractionStatus }
