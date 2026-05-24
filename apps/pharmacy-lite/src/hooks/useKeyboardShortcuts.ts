import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useKeyboardShortcuts() {
  const router = useRouter()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (target.isContentEditable) return

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        switch (e.key) {
          case '1': e.preventDefault(); router.push('/'); break
          case '2': e.preventDefault(); router.push('/scan'); break
          case '3': e.preventDefault(); router.push('/queue'); break
          case '4': e.preventDefault(); router.push('/history'); break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [router])
}
