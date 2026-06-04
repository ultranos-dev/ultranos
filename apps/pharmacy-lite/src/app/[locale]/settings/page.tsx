'use client'

import { TopHeader } from '@/components/TopHeader'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'

export default function SettingsPage() {
  return (
    <>
      <TopHeader title="Settings" />
      <PharmacySettingsView />
    </>
  )
}
