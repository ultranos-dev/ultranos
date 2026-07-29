'use client'

import { AtlasBrowser } from '@/components/atlas/AtlasBrowser'

export default function AtlasPage() {
  return (
    // h-full ensures the atlas fills the available layout area (AppShell content region)
    <div className="h-full">
      <AtlasBrowser />
    </div>
  )
}
