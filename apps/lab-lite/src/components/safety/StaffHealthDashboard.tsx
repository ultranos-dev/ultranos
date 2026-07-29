'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { ScreeningReminder, EmployeeHealthRecord } from '@/types/employee-health'
import { HepBImmunityStatus } from '@/types/employee-health'
import { getAllStaffReminders } from '@/lib/safety/screening-reminders'
import { getReminderState } from '@/lib/safety/screening-reminders'
import { getDb } from '@/lib/db'
import { decryptHealthRecord } from '@/lib/safety/health-record-crypto'
import { getSessionEncryptionKey } from '@/lib/consent-crypto'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'
import { HealthRecordView } from './HealthRecordView'
import { Button } from '@/components/ui/Button'

interface StaffSummary {
  practitionerId: string
  worstReminderState: 'green' | 'amber' | 'red'
  reminderCount: number
}

interface DashboardStats {
  totalStaff: number
  hepBImmunePercent: number
  tbCurrentPercent: number
  overdueCount: number
}

export function StaffHealthDashboard() {
  const t = useTranslations('safety.health')
  const session = useAuthSessionStore((s) => s.session)
  const [staffSummaries, setStaffSummaries] = useState<StaffSummary[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPractitioner, setSelectedPractitioner] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const loadDashboard = useCallback(async () => {
    if (!session || session.labRole !== LabRole.LAB_MANAGER) {
      setAccessDenied(true)
      setLoading(false)
      return
    }

    try {
      const [remindersMap, records] = await Promise.all([
        getAllStaffReminders(),
        loadAllRecords(),
      ])

      // Build staff summaries
      const practitionerIds = new Set<string>()
      records.forEach((r) => practitionerIds.add(r.practitionerId))
      Object.keys(remindersMap).forEach((id) => practitionerIds.add(id))

      const summaries: StaffSummary[] = []
      for (const id of practitionerIds) {
        const reminders = remindersMap[id] ?? []
        summaries.push({
          practitionerId: id,
          worstReminderState: getWorstState(reminders),
          reminderCount: reminders.length,
        })
      }

      // Sort: red first, then amber, then green
      const order = { red: 0, amber: 1, green: 2 }
      summaries.sort((a, b) => order[a.worstReminderState] - order[b.worstReminderState])
      setStaffSummaries(summaries)

      // Stats
      const totalStaff = records.length
      const hepBImmune = records.filter(
        (r) => r.hepBTiterResult === HepBImmunityStatus.IMMUNE,
      ).length
      const tbCurrent = records.filter((r) => {
        if (!r.tbScreeningDate) return false
        const daysSince =
          (Date.now() - new Date(r.tbScreeningDate).getTime()) /
          (1000 * 60 * 60 * 24)
        return daysSince < 365
      }).length

      let overdueCount = 0
      for (const reminders of Object.values(remindersMap)) {
        for (const r of reminders) {
          if (getReminderState(r.daysUntilDue) === 'OVERDUE') overdueCount++
        }
      }

      setStats({
        totalStaff,
        hepBImmunePercent: totalStaff > 0 ? Math.round((hepBImmune / totalStaff) * 100) : 0,
        tbCurrentPercent: totalStaff > 0 ? Math.round((tbCurrent / totalStaff) * 100) : 0,
        overdueCount,
      })
    } catch {
      setAccessDenied(true)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  if (selectedPractitioner) {
    return (
      <HealthRecordView
        practitionerId={selectedPractitioner}
        onBack={() => {
          setSelectedPractitioner(null)
          void loadDashboard()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-busy="true">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-medium">{t('accessDenied')}</p>
        <p className="text-sm text-muted-foreground mt-2">{t('labManagerRequired')}</p>
      </div>
    )
  }

  const STATE_COLORS = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('staffDashboard')}</h2>

      {/* Summary Statistics */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold">{stats.totalStaff}</p>
            <p className="text-sm text-muted-foreground">{t('totalStaff')}</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.hepBImmunePercent}%</p>
            <p className="text-sm text-muted-foreground">{t('hepBImmunity')}</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.tbCurrentPercent}%</p>
            <p className="text-sm text-muted-foreground">{t('tbCurrent')}</p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className={`text-2xl font-bold ${stats.overdueCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.overdueCount}
            </p>
            <p className="text-sm text-muted-foreground">{t('overdueScreenings')}</p>
          </div>
        </div>
      )}

      {/* Staff List */}
      <div className="space-y-2">
        {staffSummaries.map((staff) => (
          <button
            key={staff.practitionerId}
            onClick={() => setSelectedPractitioner(staff.practitionerId)}
            className="w-full flex items-center justify-between rounded-lg border p-4 hover:bg-muted transition-colors text-start"
          >
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${STATE_COLORS[staff.worstReminderState]}`} />
              <span className="font-medium text-sm">{staff.practitionerId}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {staff.reminderCount > 0
                ? t('reminderCount', { count: staff.reminderCount })
                : t('upToDate')}
            </div>
          </button>
        ))}

        {staffSummaries.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t('noStaffRecords')}</p>
        )}
      </div>
    </div>
  )
}

async function loadAllRecords(): Promise<EmployeeHealthRecord[]> {
  const db = getDb()
  const allEncrypted = await db.employee_health_records.toArray()
  const key = await getSessionEncryptionKey()
  const records: EmployeeHealthRecord[] = []
  for (const encrypted of allEncrypted) {
    records.push(await decryptHealthRecord(encrypted, key))
  }
  return records
}

function getWorstState(reminders: ScreeningReminder[]): 'green' | 'amber' | 'red' {
  let worst: 'green' | 'amber' | 'red' = 'green'
  for (const r of reminders) {
    const state = getReminderState(r.daysUntilDue)
    if (state === 'OVERDUE') return 'red'
    if (state === 'DUE' && worst !== 'red') worst = 'amber'
    if (state === 'UPCOMING' && worst === 'green') worst = 'amber'
  }
  return worst
}
