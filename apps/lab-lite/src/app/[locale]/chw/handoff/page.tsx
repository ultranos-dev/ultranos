'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — CHW Courier Handoff Page
// ---------------------------------------------------------------------------

import { useRouter, useParams } from 'next/navigation'
import { CourierHandoffScreen } from '@/components/chw/CourierHandoffScreen'
import { useIsCHWMode } from '@/lib/chw-mode'

export default function CHWHandoffPage() {
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
      <CourierHandoffScreen onDone={() => router.replace(`/${locale}/chw`)} />
    </div>
  )
}
