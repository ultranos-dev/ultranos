'use client'

import { useEffect, useRef, useState } from 'react'

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
        <button
          onClick={handleInstall}
          className="rounded bg-white text-primary-700 px-3 py-1.5 text-sm font-semibold hover:bg-primary-50"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="text-white/80 hover:text-white p-1"
          aria-label="Dismiss install banner"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
