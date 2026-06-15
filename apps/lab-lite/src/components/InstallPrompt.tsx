'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useSidebar } from '@/components/ui/sidebar'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'lab-lite-install-dismissed'
const SHOW_DELAY_MS = 2 * 60 * 1000 // 2 minutes

export function InstallPrompt() {
  const t = useTranslations('install')
  const { state: sidebarState } = useSidebar()
  const [showBanner, setShowBanner] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const timerFiredRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      if (localStorage.getItem(DISMISS_KEY) === 'true') return
    } catch {
      return
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as BeforeInstallPromptEvent
      if (timerFiredRef.current) {
        setShowBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    const timer = setTimeout(() => {
      timerFiredRef.current = true
      if (deferredPromptRef.current) {
        setShowBanner(true)
      }
    }, SHOW_DELAY_MS)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    const prompt = deferredPromptRef.current
    if (!prompt) return

    await prompt.prompt()
    const { outcome } = await prompt.userChoice

    if (outcome === 'accepted') {
      setShowBanner(false)
    }

    deferredPromptRef.current = null
  }

  const handleDismiss = () => {
    setShowBanner(false)
    try {
      localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // Private browsing or storage full — dismissal won't persist
    }
  }

  if (!showBanner) return null

  const sidebarOffset =
    sidebarState === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)'

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-lg transition-[margin] duration-200"
      style={{ marginInlineStart: sidebarOffset }}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-foreground">
          {t('message')}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
          >
            {t('dismiss')}
          </Button>
          <Button
            variant="primary"
            onClick={handleInstall}
          >
            {t('install')}
          </Button>
        </div>
      </div>
    </div>
  )
}
