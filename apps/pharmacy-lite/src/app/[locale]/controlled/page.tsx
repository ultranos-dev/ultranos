'use client'

import { TopHeader } from '@/components/TopHeader'
import { ControlledSubstancesView } from '@/components/pharmacy/ControlledSubstancesView'

export default function ControlledPage() {
  return (
    <>
      <TopHeader title="Controlled Substances" />
      <ControlledSubstancesView />
    </>
  )
}
