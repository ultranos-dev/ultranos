'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'

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

  const activeDir = TABS.find((tab) => tab.locale === activeTab)?.dir ?? 'ltr'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl p-0">
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between rounded-t-xl border-b border-border bg-muted px-6 py-4">
          <DialogTitle className="text-xl font-black text-foreground">
            {t('consentDocumentTitle')}
          </DialogTitle>
        </DialogHeader>

        {/* Language tabs */}
        <div className="flex border-b border-border" role="tablist" aria-label={t('consentLanguage')}>
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            {t('consentDocumentVersion')}
          </p>

          {CONSENT_SECTIONS.map((section) => (
            <div key={section} className="mb-5">
              <h3 className="text-sm font-bold text-foreground mb-1">
                {t(`consentDocument.${activeTab}.${section}Title`)}
              </h3>
              <p className="text-sm leading-relaxed text-foreground">
                {t(`consentDocument.${activeTab}.${section}Body`)}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end rounded-b-xl border-t border-border bg-muted px-6 py-4">
          <Button
            variant="primary"
            type="button"
            onClick={onClose}
          >
            {t('consentDocumentClose')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
