import { Suspense } from 'react'
import type { Metadata } from 'next'
import { RAGBoard } from '@/components/readiness/RAGBoard'

export const metadata: Metadata = {
  title: 'Lab Readiness Board',
}

export default function ReadinessPage() {
  return (
    <div className="flex flex-col gap-4">
      <Suspense>
        <RAGBoard />
      </Suspense>
    </div>
  )
}
