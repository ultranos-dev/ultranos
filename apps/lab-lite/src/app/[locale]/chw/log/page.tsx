'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — CHW Samples Collected Log Page
// ---------------------------------------------------------------------------

import { useRouter, useParams } from 'next/navigation'
import { SamplesCollectedLog } from '@/components/chw/SamplesCollectedLog'
import { useIsCHWMode } from '@/lib/chw-mode'

export default function CHWLogPage() {
  const params = useParams()
  const locale = Array.isArray(params.locale) ? params.locale[0] : (params.locale ?? 'en')
  const router = useRouter()
  const isChw = useIsCHWMode()

  if (!isChw) {
    router.replace(`/${locale}`)
    return null
  }

  return (
    <div className="min-h-screen bg-white">
      <SamplesCollectedLog onBack={() => router.replace(`/${locale}/chw`)} />
    </div>
  )
}
