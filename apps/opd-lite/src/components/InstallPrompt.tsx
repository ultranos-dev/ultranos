'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
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

  return (
    <div
      role="banner"
      aria-label="Install application"
      className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-primary-700 text-white px-4 py-3 shadow-lg"
    >
      <p className="text-sm font-medium">Install OPD Lite for offline access</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="bg-white text-primary-700 hover:bg-primary-50"
          onClick={handleInstall}
        >
          Install
        </Button>
        <Button
          variant="icon"
          type="button"
          className="text-white/80 hover:text-white p-1"
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
