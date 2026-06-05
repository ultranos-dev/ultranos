import { Suspense } from 'react'
import type { Metadata } from 'next'
import { RAGBoard } from '@/components/readiness/RAGBoard'

export const metadata: Metadata = {
  title: 'Lab Readiness Board',
}

export default function ReadinessPage() {
  return (
    <main className="p-4 md:p-6">
      <Suspense>
        <RAGBoard />
      </Suspense>
    </main>
  )
}
