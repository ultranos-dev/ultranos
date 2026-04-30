'use client'

interface PillButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}

/**
 * UX-DR2 "Primary Green Pill" button.
 * #9fe870 background, #163300 text, pill shape, scale animations.
 */
export function PillButton({ children, onClick, disabled = false }: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-pill
        bg-pill-green px-5 py-2 text-sm font-semibold text-pill-text
        transition-transform
        hover:scale-105 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
        motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
    >
      {children}
    </button>
  )
}
