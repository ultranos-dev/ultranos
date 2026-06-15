'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pharmacy-lite-install-dismissed'
const DELAY_MS = 2 * 60 * 1000 // 2 minutes

export function InstallPrompt() {
  const t = useTranslations('install')
  const { state: sidebarState } = useSidebar()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const timerFiredRef = useRef(false)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      const prompt = e as BeforeInstallPromptEvent
      setDeferredPrompt(prompt)
      if (timerFiredRef.current) setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    const timer = setTimeout(() => {
      timerFiredRef.current = true
      setDeferredPrompt((p) => {
        if (p) setShowBanner(true)
        return p
      })
    }, DELAY_MS)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [])

  if (!showBanner) return null

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowBanner(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setShowBanner(false)
  }

  const sidebarOffset =
    sidebarState === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)'

  return (
    <div
      role="banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-lg transition-[margin] duration-200"
      style={{ marginInlineStart: sidebarOffset }}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-foreground">{t('prompt')}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={handleDismiss}>
            {t('notNow')}
          </Button>
          <Button variant="default" onClick={handleInstall}>
            {t('install')}
          </Button>
        </div>
      </div>
    </div>
  )
}
