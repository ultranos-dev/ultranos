'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { AtlasBrowser } from '@/components/atlas/AtlasBrowser'

export default function AtlasPage() {
  return (
    <AuthGuard>
      {/* h-full ensures the atlas fills the available layout area (AppShell content region) */}
      <div className="h-full">
        <AtlasBrowser />
      </div>
    </AuthGuard>
  )
}
