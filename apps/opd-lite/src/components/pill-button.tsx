'use client'

interface PillButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}

/**
 * UX-DR2 "Primary Green Pill" button.
 * #9fe870 background, #163300 text, pill shape, brightness press feedback.
 */
export function PillButton({ children, onClick, disabled = false }: PillButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-pill
        bg-pill-green px-5 py-2 text-sm font-semibold text-pill-text
        transition-all duration-100 ease-out
        hover:brightness-[1.04] active:brightness-[0.88]
        focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100
        motion-reduce:hover:brightness-100 motion-reduce:active:brightness-100"
    >
      {children}
    </button>
  )
}
