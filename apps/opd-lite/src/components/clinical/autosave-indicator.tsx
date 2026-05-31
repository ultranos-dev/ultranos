'use client'

import { Cloud, CloudCheck } from '@ultranos/ui-kit/icons'

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
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 animate-spin text-neutral-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
          <span>Saving...</span>
        </span>
      )}
      {status === 'saved' && (
        <span className="flex items-center gap-2">
          <CloudCheck className="h-4 w-4 text-primary-500 animate-[pulse_1s_ease-in-out_1]" aria-hidden="true" />
          <span>Saved</span>
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-red-500" aria-hidden="true" />
          <span className="font-semibold text-red-600">Save failed — changes may not be persisted</span>
        </span>
      )}
    </div>
  )
}

