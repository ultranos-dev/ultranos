'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { useSidebar } from '@/components/ui/sidebar'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const t = useTranslations('install')
  const { state: sidebarState } = useSidebar()
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('pwa-install-dismissed') === 'true') return
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
    }
    window.addEventListener('beforeinstallprompt', handler)

    const timer = setTimeout(() => {
      if (deferredPrompt.current) setShowBanner(true)
    }, 120_000)

    const installedHandler = () => setShowBanner(false)
    window.addEventListener('appinstalled', installedHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
      clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt.current) return
    await deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice
    if (outcome === 'accepted') setShowBanner(false)
    deferredPrompt.current = null
  }

  const handleDismiss = () => {
    setShowBanner(false)
    sessionStorage.setItem('pwa-install-dismissed', 'true')
  }

  if (!showBanner) return null

  const sidebarOffset =
    sidebarState === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)'

  return (
    <div
      role="banner"
      aria-label="Install application"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-lg transition-[margin] duration-200"
      style={{ marginInlineStart: sidebarOffset }}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-foreground">{t('prompt')}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleInstall}>
            {t('install')}
          </Button>
          <Button
            variant="icon"
            type="button"
            className="p-1"
            onClick={handleDismiss}
            aria-label={t('dismiss')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
