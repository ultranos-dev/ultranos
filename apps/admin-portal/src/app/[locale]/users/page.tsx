'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import AllUsersTab from './_components/AllUsersTab'
import LabAssignmentsTab from './_components/LabAssignmentsTab'

type TabId = 'all-users' | 'lab-assignments'

function UsersContent() {
  const t = useTranslations('users')
  const searchParams = useSearchParams()

  const TABS: { id: TabId; label: string }[] = [
    { id: 'all-users', label: t('tabAllUsers') },
    { id: 'lab-assignments', label: t('tabLabAssignments') },
  ]
  const rawTab = searchParams.get('tab')
  const activeTab: TabId = rawTab === 'lab-assignments' ? 'lab-assignments' : 'all-users'

  return (
    <>
      <div>
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === 'all-users' ? '/users' : `/users?tab=${tab.id}`}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {activeTab === 'all-users' ? <AllUsersTab /> : <LabAssignmentsTab />}
    </>
  )
}

export default function UsersPage() {
  return (
    <Suspense>
      <UsersContent />
    </Suspense>
  )
}
