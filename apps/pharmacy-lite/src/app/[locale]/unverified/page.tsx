'use client'

import { TopHeader } from '@/components/TopHeader'
import { UnverifiedDispensesView } from '@/components/pharmacy/UnverifiedDispensesView'

export default function UnverifiedPage() {
  return (
    <>
      <TopHeader title="Unverified Dispenses" />
      <UnverifiedDispensesView />
    </>
  )
}
