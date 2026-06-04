'use client'

import { useState } from 'react'

interface HelpTipProps {
  content: string
  children?: React.ReactNode
}

export function HelpTip({ content, children }: HelpTipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-xs text-neutral-500 hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-300"
        aria-label={content}
      >
        {children ?? '?'}
      </button>
      {visible && (
        <div
          role="tooltip"
          className="absolute bottom-full start-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-md bg-neutral-800 px-3 py-2 text-xs text-white shadow-lg"
        >
          {content}
          <div className="absolute top-full start-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" />
        </div>
      )}
    </span>
  )
}
