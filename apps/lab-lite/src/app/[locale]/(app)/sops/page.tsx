'use client'

import { AuthGuard } from '@/components/AuthGuard'
import { SOPLibrary } from '@/components/sop/SOPLibrary'

export default function SOPsPage() {
  return (
    <AuthGuard>
      <SOPLibrary />
    </AuthGuard>
  )
}
