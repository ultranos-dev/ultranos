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
      href: `/${locale}/reports/daily`,
      icon: <Calendar size={24} />,
      title: t('dailyLogTitle'),
      description: t('dailyLogDescription'),
    },
  ]

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <FileText size={24} aria-hidden="true" />
        {t('reportsTitle')}
      </h1>

      <div className="grid gap-4">
        {reportLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-start gap-4 rounded-lg border border-border p-4 hover:bg-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="mt-0.5 text-primary" aria-hidden="true">{link.icon}</span>
            <div>
              <p className="font-semibold">{link.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
