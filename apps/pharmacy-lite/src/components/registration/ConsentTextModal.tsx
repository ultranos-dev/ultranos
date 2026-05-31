'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { X } from '@ultranos/ui-kit/icons'

interface ConsentTextModalProps {
  open: boolean
  onClose: () => void
}

const TABS = [
  { locale: 'en', labelKey: 'languageEnglish', dir: 'ltr' as const },
  { locale: 'ar', labelKey: 'languageArabic', dir: 'rtl' as const },
  { locale: 'prs', labelKey: 'languageDari', dir: 'rtl' as const },
]

const CONSENT_SECTIONS = [
  'purpose',
  'dataCollected',
  'access',
  'retention',
  'patientRights',
  'withdrawal',
] as const

export function ConsentTextModal({ open, onClose }: ConsentTextModalProps) {
  const t = useTranslations('registration')
  const [activeTab, setActiveTab] = useState<'en' | 'ar' | 'prs'>('en')
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    const timer = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  const activeDir = TABS.find((tab) => tab.locale === activeTab)?.dir ?? 'ltr'

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-text-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />

      <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white ring-[0.65px] ring-gray-400/40 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-xl border-b border-neutral-200 bg-neutral-50 px-6 py-4">
          <h2
            id="consent-text-title"
            className="text-xl font-black text-neutral-900"
          >
            {t('consentDocumentTitle')}
          </h2>
          <Button
            variant="icon"
            type="button"
            className="min-h-[44px] min-w-[44px]"
            onClick={onClose}
            aria-label={t('cancel')}
          >
            <X className="h-6 w-6 mx-auto" />
          </Button>
        </div>

        {/* Language tabs */}
        <div className="flex border-b border-neutral-200" role="tablist" aria-label={t('consentLanguage')}>
          {TABS.map((tab) => (
            <Button
              key={tab.locale}
              variant={activeTab === tab.locale ? 'primary' : 'ghost'}
              role="tab"
              aria-selected={activeTab === tab.locale}
              onClick={() => setActiveTab(tab.locale as 'en' | 'ar' | 'prs')}
              className="flex-1 min-h-[44px]"
            >
              {t(tab.labelKey)}
            </Button>
          ))}
        </div>

        {/* Consent body */}
        <div
          className="max-h-[60vh] overflow-y-auto px-6 py-5"
          dir={activeDir}
        >
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-4">
            {t('consentDocumentVersion')}
          </p>

          {CONSENT_SECTIONS.map((section) => (
            <div key={section} className="mb-5">
              <h3 className="text-sm font-bold text-neutral-900 mb-1">
                {t(`consentDocument.${activeTab}.${section}Title`)}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-700">
                {t(`consentDocument.${activeTab}.${section}Body`)}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end rounded-b-xl border-t border-neutral-200 bg-neutral-50 px-6 py-4">
          <Button
            variant="primary"
            type="button"
            onClick={onClose}
          >
            {t('consentDocumentClose')}
          </Button>
        </div>
      </div>
    </div>
  )
}
