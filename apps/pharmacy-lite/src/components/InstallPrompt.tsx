'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pharmacy-lite-install-dismissed'
const DELAY_MS = 2 * 60 * 1000 // 2 minutes

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (!deferredPrompt) return

    const timer = setTimeout(() => {
      setShowBanner(true)
    }, DELAY_MS)

    return () => clearTimeout(timer)
  }, [deferredPrompt])

  if (!showBanner) return null

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setShowBanner(false)
  }

  return (
    <div className="fixed bottom-4 start-4 z-50 rounded-lg border border-primary-200 bg-background p-4 shadow-lg">
      <p className="text-sm font-medium text-foreground">
        Install Pharmacy Lite for quick access
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          variant="default"
          onClick={handleInstall}
        >
          Install
        </Button>
        <Button
          variant="outline"
          onClick={handleDismiss}
        >
          Not now
        </Button>
      </div>
    </div>
  )
}
