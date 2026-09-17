'use client'

import { useTranslations } from 'next-intl'
import AllUsersTab from './_components/AllUsersTab'

export default function UsersPage() {
  const t = useTranslations('users')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>
      <AllUsersTab />
    </div>
  )
}
