'use client'

export interface SessionWarningToastProps {
  remainingSeconds: number
  onStaySignedIn: () => void
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) return `${seconds} seconds`
  if (seconds === 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  return `${minutes}m ${seconds}s`
}

export function SessionWarningToast({ remainingSeconds, onStaySignedIn }: SessionWarningToastProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        insetBlockEnd: '1rem',
        insetInlineEnd: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        backgroundColor: '#fef9c3',
        border: '1px solid #facc15',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        color: '#854d0e',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        zIndex: 9998,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <span>
        <strong>Session expiring in {formatCountdown(remainingSeconds)}</strong>
      </span>
      <button
        type="button"
        onClick={onStaySignedIn}
        style={{
          padding: '0.25rem 0.75rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#854d0e',
          backgroundColor: 'transparent',
          border: '1px solid #854d0e',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Stay signed in
      </button>
    </div>
  )
}
