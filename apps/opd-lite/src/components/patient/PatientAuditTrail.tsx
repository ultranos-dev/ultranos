'use client'

import { useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown } from '@ultranos/ui-kit/icons'
import { formatRelativeTime } from '@ultranos/ui-kit'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

/** Map camelCase field names to human-readable labels */
const FIELD_LABELS: Record<string, string> = {
  nameGiven: 'given name',
  nameFather: "father's name",
  nameGrandfather: "grandfather's name",
  nameLocal: 'display name',
  nameLatin: 'latin name',
  gender: 'gender',
  birthDate: 'date of birth',
  birthYear: 'birth year',
  birthYearOnly: 'birth year mode',
  telecomPhone: 'phone',
  nationalId: 'national ID',
  addressProvinceOrigin: 'origin province',
  addressDistrictOrigin: 'origin district',
  addressVillageOrigin: 'origin village',
  addressProvinceCurrent: 'current province',
  addressDistrictCurrent: 'current district',
  addressVillageCurrent: 'current village',
  isNomadic: 'nomadic status',
  preferredLanguage: 'preferred language',
  bloodGroup: 'blood group',
  photoUrl: 'photo',
  consentVersion: 'consent',
}

function humanizeFields(fields: string[]): string {
  if (fields.length === 0) return ''
  return fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')
}

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
      return fields ? t('auditUpdated', { fields }) : t('auditUpdated', { fields: 'record' })
    }
    return t('auditViewed')
  }

  return (
    <div className="rounded-xl bg-card-bg shadow-sm ring-[0.65px] ring-gray-400/40">
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
            <p className="text-sm text-muted-foreground">{t('auditEmpty')}</p>
          )}

          {entries.length > 0 && (
            <ul className="space-y-2 border-s-2 border-border ps-4">
              {entries.map((entry) => (
                <li key={entry.id} className="text-sm text-foreground">
                  <span className="font-medium">
                    {entry.actorName ?? entry.actorRole}
                  </span>
                  {entry.actorName && (
                    <span className="text-muted-foreground">
                      {' '}({entry.actorRole})
                    </span>
                  )}
                  <span className="text-muted-foreground"> — </span>
                  <span>{formatEntry(entry)}</span>
                  <span className="text-muted-foreground"> — </span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={entry.timestamp}
                    title={entry.timestamp}
                  >
                    {formatRelativeTime(
                      entry.timestamp,
                      locale as 'en' | 'ar' | 'prs',
                    )}
                  </time>
                </li>
              ))}
            </ul>
          )}

          {isAdmin && hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loading}
              className="mt-3 text-sm font-medium text-primary hover:text-primary disabled:text-muted-foreground"
            >
              {loading ? t('auditLoading') : t('auditLoadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
