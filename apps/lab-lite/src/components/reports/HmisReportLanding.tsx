'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import Link from 'next/link'
import { FileText, BarChart3, Calendar } from '@ultranos/ui-kit/icons'

export function HmisReportLanding() {
  const t = useTranslations('hmisReport')
  const locale = useLocale()

  const reportLinks = [
    {
      href: `/${locale}/reports/hmis`,
      icon: <BarChart3 size={24} />,
      title: t('title'),
      description: t('hmisDescription'),
    },
    {
      href: '#',
      icon: <Calendar size={24} />,
      title: t('dailyLogTitle'),
      description: `${t('dailyLogDescription')} (Coming Soon)`,
      disabled: true,
    },
  ]

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText size={24} aria-hidden="true" />
        {t('reportsTitle')}
      </h1>

      <div className="grid gap-4">
        {reportLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-disabled={link.disabled || undefined}
            className={`flex items-start gap-4 rounded-lg border border-border p-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${link.disabled ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`}
          >
            <span className={`mt-0.5 ${link.disabled ? 'text-muted-foreground' : 'text-primary'}`} aria-hidden="true">{link.icon}</span>
            <div>
              <p className="font-semibold">{link.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
