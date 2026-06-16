'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { SupplierConfigPanel } from '@/components/scheduler/SupplierConfigPanel'

export default function SuppliersPage() {
  const t = useTranslations('scheduler.supplier')

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
      <div>
        <Link href="/settings" className="text-sm text-blue-600 hover:underline">
          &larr; {t('backToSettings')}
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-foreground">{t('pageTitle')}</h1>
      <SupplierConfigPanel />
    </div>
  )
}
