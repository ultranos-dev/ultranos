'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TopHeader } from '@/components/TopHeader'
import AllUsersTab from './_components/AllUsersTab'
import LabAssignmentsTab from './_components/LabAssignmentsTab'

type TabId = 'all-users' | 'lab-assignments'

const TABS: { id: TabId; label: string }[] = [
  { id: 'all-users', label: 'All Users' },
  { id: 'lab-assignments', label: 'Lab Assignments' },
]

function UsersContent() {
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: TabId = rawTab === 'lab-assignments' ? 'lab-assignments' : 'all-users'

  return (
    <>
      <div className="mx-auto max-w-7xl px-8 pt-6">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === 'all-users' ? '/users' : `/users?tab=${tab.id}`}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-black text-white'
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
    <>
      <TopHeader title="Users" description="Manage staff accounts and lab assignments." />
      <Suspense>
        <UsersContent />
      </Suspense>
    </>
  )
}
