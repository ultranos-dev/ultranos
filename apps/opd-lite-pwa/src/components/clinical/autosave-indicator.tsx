'use client'

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface AutosaveIndicatorProps {
  status: AutosaveStatus
}

export function AutosaveIndicator({ status }: AutosaveIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="autosave-indicator"
      className="flex items-center gap-2 text-sm text-neutral-500"
    >
      {status === 'saving' && (
        <>
          <CloudIcon className="h-4 w-4 animate-pulse text-neutral-400" />
          <span>Saving...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <CloudCheckIcon className="h-4 w-4 text-primary-500 animate-[pulse_1s_ease-in-out_1]" />
          <span>Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <CloudIcon className="h-4 w-4 text-red-500" />
          <span className="font-semibold text-red-600">Save failed — changes may not be persisted</span>
        </>
      )}
    </div>
  )
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  )
}

function CloudCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
