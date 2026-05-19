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
    ACTIVE: 'bg-success-subtle text-success',
    PENDING_VERIFICATION: 'bg-warning-subtle text-warning',
    REJECTED: 'bg-danger-subtle text-danger',
    SUSPENDED: 'bg-danger-subtle text-danger',
  }

  const labelMap: Record<string, string> = {
    ACTIVE: 'Active',
    PENDING_VERIFICATION: 'Pending Verification',
    REJECTED: 'Rejected',
    SUSPENDED: 'Suspended',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function SubmissionStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING: 'bg-warning-subtle text-warning',
    APPROVED: 'bg-success-subtle text-success',
    REJECTED: 'bg-danger-subtle text-danger',
    REQUEST_MORE_INFO: 'bg-warning-subtle text-warning',
  }

  const labelMap: Record<string, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    REQUEST_MORE_INFO: 'More Info',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function AlertStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    UNREVIEWED: 'bg-warning-subtle text-warning',
    DISMISSED: 'bg-surface text-text-secondary',
    ESCALATED: 'bg-danger-subtle text-danger',
    RESOLVED: 'bg-success-subtle text-success',
  }

  const labelMap: Record<string, string> = {
    UNREVIEWED: 'Unreviewed',
    DISMISSED: 'Dismissed',
    ESCALATED: 'Escalated',
    RESOLVED: 'Resolved',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    HIGH: 'bg-danger-subtle text-danger',
    MEDIUM: 'bg-warning-subtle text-warning',
    LOW: 'bg-surface text-text-secondary',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[severity] ?? 'bg-surface text-text-secondary'}`}>
      {severity}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-block rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-text-secondary">
      {role}
    </span>
  )
}

function LicenseUrgencyBadge({ daysRemaining }: { daysRemaining: number }) {
  if (daysRemaining <= 0) {
    return <span className="inline-block rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">Expired</span>
  }
  if (daysRemaining <= 7) {
    return <span className="inline-block rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">{daysRemaining} days remaining</span>
  }
  if (daysRemaining <= 30) {
    return <span className="inline-block rounded-full bg-warning-subtle px-2.5 py-0.5 text-xs font-medium text-warning">{daysRemaining} days remaining</span>
  }
  if (daysRemaining <= 60) {
    return <span className="inline-block rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">{daysRemaining} days remaining</span>
  }
  return <span className="inline-block rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">{daysRemaining} days remaining</span>
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
    return <div className="text-text-secondary p-8">Loading provider profile...</div>
  }

  if (error && !profile) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/providers" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Providers</Link>
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
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
        <Link href="/providers" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Providers</Link>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Section A: Identity Card */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            <span className="wavy-divider">Provider Identity</span>
          </h2>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-xl font-semibold text-text-primary">{practitioner.name}</p>
              <p className="text-sm text-text-secondary">{practitioner.email}</p>
              <p className="text-sm text-text-secondary">{practitioner.phone ?? '—'}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <RoleBadge role={practitioner.role} />
                <KycStatusBadge status={practitioner.kycStatus} />
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="text-sm text-text-secondary">
                License Expiry: <span className="font-medium text-text-primary">{formatDate(practitioner.licenseExpiry)}</span>
              </div>
              <LicenseUrgencyBadge daysRemaining={practitioner.daysRemaining} />
            </div>
          </div>
        </div>

        {/* Section B: KYC History */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            <span className="wavy-divider">KYC History</span>
          </h2>

          {kycSubmissions.length === 0 ? (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-border p-8 text-center">
              <p className="text-text-secondary">No KYC submissions found.</p>
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
                <tbody className="divide-y divide-border bg-surface-raised">
                  {kycSubmissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-accent-subtle transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{truncateId(sub.id)}</td>
                      <td className="px-4 py-3"><SubmissionStatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(sub.submittedAt)}</td>
                      <td className="px-4 py-3 text-text-secondary">{sub.reviewedAt ? formatDate(sub.reviewedAt) : '—'}</td>
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
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            <span className="wavy-divider">License Timeline</span>
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold text-text-primary">{formatDate(practitioner.licenseExpiry)}</span>
              <LicenseUrgencyBadge daysRemaining={practitioner.daysRemaining} />
            </div>

            {practitioner.daysRemaining <= 0 && (
              <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">
                This provider&apos;s license has expired. They should not be permitted to prescribe until the license is renewed and verified.
              </div>
            )}
          </div>
        </div>

        {/* Section D: Prescribing Alert History */}
        <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            <span className="wavy-divider">Prescribing Alert History</span>
          </h2>

          {/* Alert summary line */}
          <p className="mt-4 text-sm text-text-secondary">
            {alertSummary.total} total alerts: {alertSummary.dismissed} dismissed, {alertSummary.escalated} escalated, {alertSummary.resolved} resolved
          </p>

          {/* Unresolved alert warning */}
          {hasUnresolvedAlertWarning && (
            <div className="mt-3 rounded-2xl bg-warning-subtle border border-warning/20 p-3 text-sm text-warning">
              This provider has multiple unresolved alerts.
            </div>
          )}

          {alerts.length === 0 ? (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-border p-8 text-center">
              <p className="text-text-secondary">No prescribing alerts.</p>
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
                <tbody className="divide-y divide-border bg-surface-raised">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-accent-subtle transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{truncateId(alert.id)}</td>
                      <td className="px-4 py-3 text-text-primary">{alert.anomalyType}</td>
                      <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                      <td className="px-4 py-3"><AlertStatusBadge status={alert.status} /></td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(alert.createdAt)}</td>
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
