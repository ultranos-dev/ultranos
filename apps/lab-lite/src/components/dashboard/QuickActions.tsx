'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Plus } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'

export function QuickActions() {
  const t = useTranslations('dashboard')

  return (
    <Button asChild variant="primary" fullWidth className="justify-center">
      <Link href="/upload">
        <Plus size={16} aria-hidden="true" />
        {t('uploadNewResult')}
      </Link>
    </Button>
  )
}
