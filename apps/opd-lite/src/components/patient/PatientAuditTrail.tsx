'use client'

import { useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, History } from '@ultranos/ui-kit/icons'
import { formatRelativeTime } from '@ultranos/ui-kit'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getHubBaseUrl } from '@/lib/hub-url'
import { Card } from '@/components/Card'
import { Button } from '@/components/ui/Button'

const HUB_API_URL = getHubBaseUrl()


interface AuditEntry {
  id: string
  action: string
  actorName?: string
  actorRole: string
  fieldsUpdated: string[]
  operation: string
  timestamp: string
}

interface PatientAuditTrailProps {
  patientId: string
  userRole: string
}

export function PatientAuditTrail({
  patientId,
  userRole,
}: PatientAuditTrailProps) {
  const t = useTranslations('patient')
  const locale = useLocale()

  const auditFieldLabels: Record<string, string> = {
    nameGiven: t('auditField.nameGiven' as never),
    nameFather: t('auditField.nameFather' as never),
    nameGrandfather: t('auditField.nameGrandfather' as never),
    nameLocal: t('auditField.nameLocal' as never),
    nameLatin: t('auditField.nameLatin' as never),
    gender: t('auditField.gender' as never),
    birthDate: t('auditField.birthDate' as never),
    birthYear: t('auditField.birthYear' as never),
    birthYearOnly: t('auditField.birthYearOnly' as never),
    telecomPhone: t('auditField.telecomPhone' as never),
    nationalId: t('auditField.nationalId' as never),
    addressProvinceOrigin: t('auditField.addressProvinceOrigin' as never),
    addressDistrictOrigin: t('auditField.addressDistrictOrigin' as never),
    addressVillageOrigin: t('auditField.addressVillageOrigin' as never),
    addressProvinceCurrent: t('auditField.addressProvinceCurrent' as never),
    addressDistrictCurrent: t('auditField.addressDistrictCurrent' as never),
    addressVillageCurrent: t('auditField.addressVillageCurrent' as never),
    isNomadic: t('auditField.isNomadic' as never),
    preferredLanguage: t('auditField.preferredLanguage' as never),
    bloodGroup: t('auditField.bloodGroup' as never),
    photoUrl: t('auditField.photoUrl' as never),
    consentVersion: t('auditField.consentVersion' as never),
  }

  function humanizeFields(fields: string[]): string {
    if (fields.length === 0) return ''
    return fields.map((f) => auditFieldLabels[f] ?? f).join(', ')
  }

  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const isAdmin = userRole === 'ADMIN'

  const fetchEntries = useCallback(
    async (nextCursor?: string) => {
      setLoading(true)
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return

        const input: Record<string, unknown> = {
          patientId,
          limit: isAdmin ? 50 : 10,
        }
        if (nextCursor) input.cursor = nextCursor

        const params = encodeURIComponent(JSON.stringify({ json: input }))
        const res = await fetch(
          `${HUB_API_URL}/api/trpc/patient.auditTrail?input=${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )

        if (!res.ok) return

        const body = (await res.json()) as {
          result: {
            data: {
              json: {
                entries: AuditEntry[]
                nextCursor: string | null
                hasMore: boolean
              }
            }
          }
        }

        const result = body.result.data.json
        setEntries((prev) =>
          nextCursor ? [...prev, ...result.entries] : result.entries,
        )
        setCursor(result.nextCursor)
        setHasMore(result.hasMore)
        setLoaded(true)
      } catch {
        // Silently fail — audit trail is non-critical UI
      } finally {
        setLoading(false)
      }
    },
    [patientId, isAdmin],
  )

  const handleToggle = useCallback(() => {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    if (willOpen && !loaded) {
      fetchEntries()
    }
  }, [isOpen, loaded, fetchEntries])

  const handleLoadMore = useCallback(() => {
    if (cursor) fetchEntries(cursor)
  }, [cursor, fetchEntries])

  function formatEntry(entry: AuditEntry): string {
    const fields = humanizeFields(entry.fieldsUpdated)
    if (entry.operation === 'create') return t('auditCreated')
    if (
      entry.operation === 'update' ||
      entry.action === 'PHI_WRITE' ||
      entry.action === 'UPDATE'
    ) {
      return fields ? t('auditUpdated', { fields }) : t('auditUpdated', { fields: t('auditFieldRecord') })
    }
    return t('auditViewed')
  }

  return (
    <Card className="p-0">
      {/* Toggle header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-start"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="patient-audit-trail-content"
      >
        <span className="text-sm font-semibold text-foreground">
          {t('auditTrail')}
          {loaded && (
            <span className="ms-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {entries.length}{hasMore ? '+' : ''}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Content */}
      {isOpen && (
        <div id="patient-audit-trail-content" className="px-5 pb-5">
          {loading && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('auditLoading')}</p>
          )}

          {loaded && entries.length === 0 && (
            <EmptyState size="sm" icon={History} title={t('auditEmpty')} />
          )}

          {entries.length > 0 && (
            <ul className="space-y-2 border-s-2 border-border ps-4">
              {entries.map((entry) => (
                <li key={entry.id} className="text-sm text-foreground">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{entry.actorName ?? entry.actorRole}</span>
                    {entry.actorName && (
                      <span className="text-xs text-muted-foreground">({entry.actorRole})</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
                    <span className="text-foreground">{formatEntry(entry)}</span>
                    <time className="text-xs" dateTime={entry.timestamp} title={entry.timestamp}>
                      {formatRelativeTime(entry.timestamp, locale as 'en' | 'ar' | 'prs')}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isAdmin && hasMore && (
            <Button
              variant="ghost"
              type="button"
              onClick={handleLoadMore}
              disabled={loading}
              className="mt-3"
            >
              {loading ? t('auditLoading') : t('auditLoadMore')}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
