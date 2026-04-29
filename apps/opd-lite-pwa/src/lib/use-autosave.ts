import { useRef, useCallback, useEffect } from 'react'

interface UseAutosaveOptions {
  onSave: () => Promise<void>
  delay: number
}

export function useAutosave({ onSave, delay }: UseAutosaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSaveRef.current()
    }, delay)
  }, [delay])

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      onSaveRef.current()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { trigger, flush }
}
