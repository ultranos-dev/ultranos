'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { Button } from '@/components/ui/button'

type VaccinationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE'
type TbResult = 'NEGATIVE' | 'POSITIVE' | 'INDETERMINATE' | ''

interface ExposureEntry {
  date: string
  type: string
  outcome: string
}

interface FormState {
  hepBStatus: VaccinationStatus
  hepBTiterDate: string
  tetanusStatus: VaccinationStatus
  tetanusDate: string
  covidStatus: VaccinationStatus
  covidDoses: number
  covidLastDoseDate: string
  tbScreeningDate: string
  tbScreeningResult: TbResult
  exposureHistory: ExposureEntry[]
}

const INITIAL_FORM: FormState = {
  hepBStatus: 'NOT_STARTED',
  hepBTiterDate: '',
  tetanusStatus: 'NOT_STARTED',
  tetanusDate: '',
  covidStatus: 'NOT_STARTED',
  covidDoses: 0,
  covidLastDoseDate: '',
  tbScreeningDate: '',
  tbScreeningResult: '',
  exposureHistory: [],
}

const STATUS_OPTIONS: { value: VaccinationStatus; label: string }[] = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETE', label: 'Complete' },
]

const TB_RESULT_OPTIONS: { value: TbResult; label: string }[] = [
  { value: '', label: 'Select...' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'POSITIVE', label: 'Positive' },
  { value: 'INDETERMINATE', label: 'Indeterminate' },
]

function ScreeningBanner({ reminders }: { reminders: { tbScreening: { status: string; message: string } } }) {
  const { status, message } = reminders.tbScreening
  if (status === 'UP_TO_DATE') return null

  const colorMap: Record<string, string> = {
    OVERDUE: 'bg-red-100 border-red-400 text-red-800',
    DUE_SOON: 'bg-amber-100 border-amber-400 text-amber-800',
    NOT_RECORDED: 'bg-amber-100 border-amber-400 text-amber-800',
  }

  return (
    <div className={`rounded-lg border-s-4 p-4 mb-6 ${colorMap[status] ?? ''}`} role="alert">
      <p className="font-medium">{message}</p>
    </div>
  )
}

export default function EmployeeHealthPage() {
  const params = useParams()
  const router = useRouter()
  const practitionerId = params.practitionerId as string

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [reminders, setReminders] = useState<{ tbScreening: { status: string; message: string } } | null>(null)

  const loadRecord = useCallback(async () => {
    setLoading(true)
    try {
      const record = await trpc.admin.getEmployeeHealth.query({ practitionerId })
      if (record) {
        setForm({
          hepBStatus: record.hepBStatus as VaccinationStatus,
          hepBTiterDate: record.hepBTiterDate ?? '',
          tetanusStatus: record.tetanusStatus as VaccinationStatus,
          tetanusDate: record.tetanusDate ?? '',
          covidStatus: record.covidStatus as VaccinationStatus,
          covidDoses: record.covidDoses ?? 0,
          covidLastDoseDate: record.covidLastDoseDate ?? '',
          tbScreeningDate: record.tbScreeningDate ?? '',
          tbScreeningResult: (record.tbScreeningResult as TbResult) ?? '',
          exposureHistory: record.exposureHistory ?? [],
        })
        setReminders(record.reminders)
      }
    } catch {
      setToast({ type: 'error', message: 'Failed to load health record' })
    } finally {
      setLoading(false)
    }
  }, [practitionerId])

  useEffect(() => {
    loadRecord()
  }, [loadRecord])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const handleSave = async () => {
    setSaving(true)
    try {
      await trpc.admin.updateEmployeeHealth.mutate({
        practitionerId,
        hepBStatus: form.hepBStatus,
        hepBTiterDate: form.hepBTiterDate || null,
        tetanusStatus: form.tetanusStatus,
        tetanusDate: form.tetanusDate || null,
        covidStatus: form.covidStatus,
        covidDoses: form.covidDoses,
        covidLastDoseDate: form.covidLastDoseDate || null,
        tbScreeningDate: form.tbScreeningDate || null,
        tbScreeningResult: (form.tbScreeningResult || null) as 'NEGATIVE' | 'POSITIVE' | 'INDETERMINATE' | null,
        exposureHistory: form.exposureHistory,
      })
      setToast({ type: 'success', message: 'Health record saved successfully' })
      await loadRecord()
    } catch {
      setToast({ type: 'error', message: 'Failed to save health record' })
    } finally {
      setSaving(false)
    }
  }

  const addExposureEntry = () => {
    setForm((prev) => ({
      ...prev,
      exposureHistory: [...prev.exposureHistory, { date: '', type: '', outcome: '' }],
    }))
  }

  const removeExposureEntry = (index: number) => {
    setForm((prev) => ({
      ...prev,
      exposureHistory: prev.exposureHistory.filter((_, i) => i !== index),
    }))
  }

  const updateExposureEntry = (index: number, field: keyof ExposureEntry, value: string) => {
    setForm((prev) => ({
      ...prev,
      exposureHistory: prev.exposureHistory.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry,
      ),
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopHeader title="Employee Health Record" />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-card" />
            <div className="h-40 rounded bg-card" />
            <div className="h-40 rounded bg-card" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TopHeader title="Employee Health Record" />
      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Back link */}
        <Button
          variant="link"
          onClick={() => router.push('/users?tab=lab-assignments')}
          className="mb-4 px-0"
        >
          &larr; Back to Lab Assignments
        </Button>

        {/* Toast */}
        {toast && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
            role="status"
          >
            {toast.message}
          </div>
        )}

        {/* Screening Reminder Banner */}
        {reminders && <ScreeningBanner reminders={reminders} />}

        {/* Hepatitis B */}
        <section className="mb-8 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-text">Hepatitis B</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <select
                value={form.hepBStatus}
                onChange={(e) => setForm({ ...form, hepBStatus: e.target.value as VaccinationStatus })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Titer Date</span>
              <input
                type="date"
                value={form.hepBTiterDate}
                onChange={(e) => setForm({ ...form, hepBTiterDate: e.target.value })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        {/* Tetanus */}
        <section className="mb-8 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-text">Tetanus</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <select
                value={form.tetanusStatus}
                onChange={(e) => setForm({ ...form, tetanusStatus: e.target.value as VaccinationStatus })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Vaccination Date</span>
              <input
                type="date"
                value={form.tetanusDate}
                onChange={(e) => setForm({ ...form, tetanusDate: e.target.value })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        {/* COVID-19 */}
        <section className="mb-8 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-text">COVID-19</h2>
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <select
                value={form.covidStatus}
                onChange={(e) => setForm({ ...form, covidStatus: e.target.value as VaccinationStatus })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Doses</span>
              <input
                type="number"
                min={0}
                value={form.covidDoses}
                onChange={(e) => setForm({ ...form, covidDoses: parseInt(e.target.value) || 0 })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Last Dose Date</span>
              <input
                type="date"
                value={form.covidLastDoseDate}
                onChange={(e) => setForm({ ...form, covidLastDoseDate: e.target.value })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        {/* TB Screening */}
        <section className="mb-8 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-text">TB Screening</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Screening Date</span>
              <input
                type="date"
                value={form.tbScreeningDate}
                onChange={(e) => setForm({ ...form, tbScreeningDate: e.target.value })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">Result</span>
              <select
                value={form.tbScreeningResult}
                onChange={(e) => setForm({ ...form, tbScreeningResult: e.target.value as TbResult })}
                className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
              >
                {TB_RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Exposure History */}
        <section className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Exposure History</h2>
            <Button
              type="button"
              size="sm"
              onClick={addExposureEntry}
            >
              + Add Entry
            </Button>
          </div>

          {form.exposureHistory.length === 0 && (
            <p className="text-sm text-muted-foreground">No exposure history entries.</p>
          )}

          {form.exposureHistory.map((entry, i) => (
            <div key={i} className="mb-3 grid grid-cols-4 gap-3 items-end">
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Date</span>
                <input
                  type="date"
                  value={entry.date}
                  onChange={(e) => updateExposureEntry(i, 'date', e.target.value)}
                  className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Type</span>
                <input
                  type="text"
                  value={entry.type}
                  onChange={(e) => updateExposureEntry(i, 'type', e.target.value)}
                  placeholder="e.g. Needlestick"
                  className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">Outcome</span>
                <input
                  type="text"
                  value={entry.outcome}
                  onChange={(e) => updateExposureEntry(i, 'outcome', e.target.value)}
                  placeholder="e.g. No seroconversion"
                  className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => removeExposureEntry(i)}
              >
                Remove
              </Button>
            </div>
          ))}
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Health Record'}
          </Button>
        </div>
      </main>
    </div>
  )
}
