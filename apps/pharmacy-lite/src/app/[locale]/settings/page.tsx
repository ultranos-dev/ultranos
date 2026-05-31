'use client'

import Link from 'next/link'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ArrowLeft } from '@ultranos/ui-kit/icons'

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="Back to dashboard"
        >
          <DirectionalIcon category="navigation">
            <ArrowLeft className="h-5 w-5" />
          </DirectionalIcon>
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
      </div>

      <PharmacySettingsView />
    </div>
  )
}
