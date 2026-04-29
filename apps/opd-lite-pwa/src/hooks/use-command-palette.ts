import { useCallback, useEffect, useState } from 'react'

/**
 * Global keyboard listener for Ctrl+K / Cmd+K to toggle the command palette.
 * Returns open state and setter for programmatic control.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setOpen((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return { open, setOpen }
}
