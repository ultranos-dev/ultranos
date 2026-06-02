'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

interface Practitioner {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  kycStatus: string
  licenseExpiry: string
  daysRemaining: number
  status: string
  createdAt: string
}

interface KycSubmission {
  id: string
  status: string
  submittedAt: string
  reviewedAt: string | null
}

interface Alert {
  id: string
  anomalyType: string
  severity: string
  status: string
  createdAt: string
}

interface AlertSummary {
  total: number
  dismissed: number
  escalated: number
  resolved: number
  unreviewed: number
}

interface ProviderProfile {
  practitioner: Practitioner
  kycSubmissions: KycSubmission[]
  alerts: Alert[]
  alertSummary: AlertSummary
}

function KycStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-success/10 text-success',
    PENDING_VERIFICATION: 'bg-warning/10 text-warning',
    REJECTED: 'bg-destructive/10 text-destructive',
    SUSPENDED: 'bg-destructive/10 text-destructive',
  }

  const labelMap: Record<string, string> = {
    ACTIVE: 'Active',
    PENDING_VERIFICATION: 'Pending Verification',
    REJECTED: 'Rejected',
    SUSPENDED: 'Suspended',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-card text-muted-foreground'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function SubmissionStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING: 'bg-warning/10 text-warning',
    APPROVED: 'bg-success/10 text-success',
    REJECTED: 'bg-destructive/10 text-destructive',
    REQUEST_MORE_INFO: 'bg-warning/10 text-warning',
  }

  const labelMap: Record<string, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    REQUEST_MORE_INFO: 'More Info',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-card text-muted-foreground'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function AlertStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    UNREVIEWED: 'bg-warning/10 text-warning',
    DISMISSED: 'bg-card text-muted-foreground',
    ESCALATED: 'bg-destructive/10 text-destructive',
    RESOLVED: 'bg-success/10 text-success',
  }

  const labelMap: Record<string, string> = {
    UNREVIEWED: 'Unreviewed',
    DISMISSED: 'Dismissed',
    ESCALATED: 'Escalated',
    RESOLVED: 'Resolved',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-card text-muted-foreground'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    HIGH: 'bg-destructive/10 text-destructive',
    MEDIUM: 'bg-warning/10 text-warning',
    LOW: 'bg-card text-muted-foreground',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[severity] ?? 'bg-card text-muted-foreground'}`}>
      {severity}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-block rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {role}
    </span>
  )
}

function LicenseUrgencyBadge({ daysRemaining }: { daysRemaining: number }) {
  if (daysRemaining <= 0) {
    return <span className="inline-block rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Expired</span>
  }
  if (daysRemaining <= 7) {
    return <span className="inline-block rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">{daysRemaining} days remaining</span>
  }
  if (daysRemaining <= 30) {
    return <span className="inline-block rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">{daysRemaining} days remaining</span>
  }
  if (daysRemaining <= 60) {
    return <span className="inline-block rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">{daysRemaining} days remaining</span>
  }
  return <span className="inline-block rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">{daysRemaining} days remaining</span>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + '...' : id
}

export default function ProviderProfilePage() {
  const params = useParams()
  const practitionerId = params.practitionerId as string

  const [profile, setProfile] = useState<ProviderProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.getProviderProfile.query({ practitionerId })
      setProfile(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load provider profile')
    } finally {
      setLoading(false)
    }
  }, [practitionerId])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  if (loading) {
    return <div className="text-muted-foreground p-8">Loading provider profile...</div>
  }

  if (error && !profile) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/providers" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to Providers</Link>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!profile) return null

  const { practitioner, kycSubmissions, alerts, alertSummary } = profile
  const hasUnresolvedAlertWarning = (alertSummary.escalated + alertSummary.unreviewed) >= 3

  return (
    <>
      <TopHeader title={practitioner.name} description={practitioner.email} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/providers" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to Providers</Link>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Section A: Identity Card */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            <span className="wavy-divider">Provider Identity</span>
          </h2>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-xl font-semibold text-foreground">{practitioner.name}</p>
              <p className="text-sm text-muted-foreground">{practitioner.email}</p>
              <p className="text-sm text-muted-foreground">{practitioner.phone ?? '—'}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <RoleBadge role={practitioner.role} />
                <KycStatusBadge status={practitioner.kycStatus} />
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="text-sm text-muted-foreground">
                License Expiry: <span className="font-medium text-foreground">{formatDate(practitioner.licenseExpiry)}</span>
              </div>
              <LicenseUrgencyBadge daysRemaining={practitioner.daysRemaining} />
            </div>
          </div>
        </div>

        {/* Section B: KYC History */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            <span className="wavy-divider">KYC History</span>
          </h2>

          {kycSubmissions.length === 0 ? (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">No KYC submissions found.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Submission ID</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Submitted</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Reviewed</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {kycSubmissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-primary/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{truncateId(sub.id)}</td>
                      <td className="px-4 py-3"><SubmissionStatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(sub.submittedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sub.reviewedAt ? formatDate(sub.reviewedAt) : '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/providers/${sub.id}`}
                          className="text-sm font-medium text-black hover:text-brand-lime transition-colors"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section C: License Timeline */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            <span className="wavy-divider">License Timeline</span>
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold text-foreground">{formatDate(practitioner.licenseExpiry)}</span>
              <LicenseUrgencyBadge daysRemaining={practitioner.daysRemaining} />
            </div>

            {practitioner.daysRemaining <= 0 && (
              <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                This provider&apos;s license has expired. They should not be permitted to prescribe until the license is renewed and verified.
              </div>
            )}
          </div>
        </div>

        {/* Section D: Prescribing Alert History */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            <span className="wavy-divider">Prescribing Alert History</span>
          </h2>

          {/* Alert summary line */}
          <p className="mt-4 text-sm text-muted-foreground">
            {alertSummary.total} total alerts: {alertSummary.dismissed} dismissed, {alertSummary.escalated} escalated, {alertSummary.resolved} resolved
          </p>

          {/* Unresolved alert warning */}
          {hasUnresolvedAlertWarning && (
            <div className="mt-3 rounded-2xl bg-warning/10 border border-warning/20 p-3 text-sm text-warning">
              This provider has multiple unresolved alerts.
            </div>
          )}

          {alerts.length === 0 ? (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-border p-8 text-center">
              <p className="text-muted-foreground">No prescribing alerts.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Alert ID</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Severity</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-primary/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{truncateId(alert.id)}</td>
                      <td className="px-4 py-3 text-foreground">{alert.anomalyType}</td>
                      <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                      <td className="px-4 py-3"><AlertStatusBadge status={alert.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(alert.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/alerts/${alert.id}`}
                          className="text-sm font-medium text-black hover:text-brand-lime transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
