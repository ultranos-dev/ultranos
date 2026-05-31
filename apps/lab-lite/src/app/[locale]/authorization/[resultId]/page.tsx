'use client'

/**
 * Story 42.5 — Authorization Result Detail Page
 * Loads a specific result and its observations, renders ResultReviewPanel.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ResultReviewPanel } from '@/components/authorization/ResultReviewPanel'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getDb } from '@/lib/db'
import type { LabResult, LabObservation } from '@/lib/db'
import { LabRole } from '@ultranos/shared-types'
import { AuthorizationStatus } from '@/types/authorization'

export default function ResultDetailPage() {
  const t = useTranslations('authorization')
  const router = useRouter()
  const params = useParams<{ resultId: string; locale: string }>()
  const session = useAuthSessionStore((s) => s.session)
  const labRole = session?.labRole as LabRole | null

  const [result, setResult] = useState<LabResult | null>(null)
  const [observations, setObservations] = useState<LabObservation[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Guard: redirect if role insufficient
  useEffect(() => {
    if (session !== null && labRole !== null && !canAccessAuthorizationQueue(labRole)) {
      router.replace('/')
    }
  }, [session, labRole, router])

  useEffect(() => {
    if (!params.resultId) return
    let active = true

    async function load() {
      setLoading(true)
      try {
        const db = getDb()
        const [r, obs] = await Promise.all([
          db.lab_results.get(params.resultId),
          db.lab_observations.where('resultId').equals(params.resultId).toArray(),
        ])
        if (!active) return
        if (!r) {
          setNotFound(true)
        } else {
          setResult(r)
          setObservations(obs)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [params.resultId])

  if (!session || !labRole || !canAccessAuthorizationQueue(labRole)) return null

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-neutral-500" aria-busy="true">
        {t('loading')}
      </div>
    )
  }

  if (notFound || !result) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center text-neutral-500">
        <p className="text-lg">{t('resultNotFound')}</p>
        <button
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => router.push(`/${params.locale}/authorization`)}
        >
          {t('backToQueue')}
        </button>
      </div>
    )
  }

  return (
    <ResultReviewPanel
      result={result}
      observations={observations}
      onClose={() => router.push(`/${params.locale}/authorization`)}
      onActionComplete={(_status: AuthorizationStatus) => {
        router.push(`/${params.locale}/authorization`)
      }}
    />
  )
}
