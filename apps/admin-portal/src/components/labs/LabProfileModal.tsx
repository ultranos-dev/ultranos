'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ProfileSection,
  ProfileField,
  StarRating,
  MapLink,
  HoursTable,
  TagList,
  LogoAvatar,
} from '@/components/facilities/primitives'
import { trpc } from '@/lib/trpc'

interface LabProfile {
  id: string
  labName: string
  licenseReference: string
  accreditationReference?: string | null
  capAccredited?: boolean | null
  status: string
  turnaroundTimeHours?: number | null
  homeCollection?: boolean | null
  sampleCollection?: boolean | null
  specialties?: string[] | null
  // contact
  phone?: string | null
  altPhone?: string | null
  email?: string | null
  website?: string | null
  whatsapp?: string | null
  // location
  address?: string | null
  city?: string | null
  province?: string | null
  district?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  googleMapsUrl?: string | null
  // hours
  openingHours?: unknown | null
  is247?: boolean | null
  // contact person
  contactPersonName?: string | null
  contactPersonRole?: string | null
  contactPersonPhone?: string | null
  // display
  logoUrl?: string | null
  googleRating?: number | null
  googleReviewCount?: number | null
  registeredAt?: string | null
}

interface LabProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  labId: string
  onEdit: (lab: LabProfile) => void
  onChanged: () => void
}

function statusVariant(status: string): 'warning' | 'success' | 'destructive' | 'secondary' {
  if (status === 'PENDING') return 'warning'
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'destructive'
  return 'secondary'
}

export function LabProfileModal({
  open,
  onOpenChange,
  labId,
  onEdit,
  onChanged,
}: LabProfileModalProps) {
  const t = useTranslations()
  const router = useRouter()
  const [lab, setLab] = useState<LabProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [actionPending, setActionPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setSuspendReason('')
    let cancelled = false
    setLoading(true)
    setLab(null)
    trpc.admin.getLabDetail.query({ labId })
      .then((result) => {
        if (!cancelled) setLab(result as LabProfile)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, labId])

  async function handleReview(action: 'APPROVE' | 'SUSPEND' | 'REACTIVATE', reason?: string) {
    setActionPending(true)
    try {
      await trpc.admin.reviewLab.mutate({ labId, action, ...(reason ? { reason } : {}) })
      setSuspendConfirmOpen(false)
      onOpenChange(false)
      onChanged()
    } finally {
      setActionPending(false)
    }
  }

  async function handleArchive() {
    setActionPending(true)
    try {
      await trpc.admin.archiveLab.mutate({ labId })
      setArchiveConfirmOpen(false)
      onOpenChange(false)
      onChanged()
    } finally {
      setActionPending(false)
    }
  }

  async function handleRestore() {
    setActionPending(true)
    try {
      await trpc.admin.restoreLab.mutate({ labId })
      onOpenChange(false)
      onChanged()
    } finally {
      setActionPending(false)
    }
  }

  const isArchived = lab?.status === 'ARCHIVED'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {loading || !lab ? (
                <span className="text-muted-foreground">{t('common.loading') ?? 'Loading…'}</span>
              ) : (
                <div className="flex items-center gap-3">
                  <LogoAvatar url={lab.logoUrl ?? null} name={lab.labName} size={40} />
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-semibold text-foreground">{lab.labName}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={statusVariant(lab.status)} className="text-xs">
                        {lab.status}
                      </Badge>
                      {lab.googleRating != null && (
                        <StarRating
                          rating={lab.googleRating}
                          reviewCount={lab.googleReviewCount ?? null}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Lab profile and management actions</DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
              {t('common.loading') ?? 'Loading…'}
            </div>
          )}

          {!loading && lab && (
            <div className="flex flex-col gap-4">
              {/* License / Accreditation */}
              <ProfileSection title={t('labs.sectionLicense') ?? 'License & Accreditation'}>
                <ProfileField label={t('labs.licenseReference') ?? 'License Ref'} value={lab.licenseReference} />
                {lab.accreditationReference && (
                  <ProfileField label={t('labs.accreditationReference') ?? 'Accreditation Ref'} value={lab.accreditationReference} />
                )}
                <ProfileField
                  label={t('labs.capAccredited') ?? 'CAP Accredited'}
                  value={lab.capAccredited ? (t('common.yes') ?? 'Yes') : (t('common.no') ?? 'No')}
                />
              </ProfileSection>

              {/* Test Menu / Specialties */}
              {(lab.specialties?.length ?? 0) > 0 && (
                <ProfileSection title={t('labs.sectionSpecialties') ?? 'Test Menu & Specialties'}>
                  <TagList items={lab.specialties} />
                </ProfileSection>
              )}

              {/* Turnaround & Collection */}
              <ProfileSection title={t('labs.sectionOperational') ?? 'Operational'}>
                {lab.turnaroundTimeHours != null && (
                  <ProfileField
                    label={t('labs.turnaroundTimeHours') ?? 'Turnaround (hrs)'}
                    value={String(lab.turnaroundTimeHours)}
                  />
                )}
                <ProfileField
                  label={t('labs.homeCollection') ?? 'Home Collection'}
                  value={lab.homeCollection ? (t('common.yes') ?? 'Yes') : (t('common.no') ?? 'No')}
                />
                <ProfileField
                  label={t('labs.sampleCollection') ?? 'Sample Collection'}
                  value={lab.sampleCollection ? (t('common.yes') ?? 'Yes') : (t('common.no') ?? 'No')}
                />
              </ProfileSection>

              {/* Contact */}
              {(lab.phone || lab.email || lab.website || lab.whatsapp) && (
                <ProfileSection title={t('labs.sectionContact') ?? 'Contact'}>
                  {lab.phone && <ProfileField label={t('labs.phone') ?? 'Phone'} value={lab.phone} />}
                  {lab.altPhone && <ProfileField label={t('labs.altPhone') ?? 'Alt Phone'} value={lab.altPhone} />}
                  {lab.email && <ProfileField label={t('labs.email') ?? 'Email'} value={lab.email} />}
                  {lab.website && (
                    <ProfileField
                      label={t('labs.website') ?? 'Website'}
                      value={
                        <a href={lab.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {lab.website}
                        </a>
                      }
                    />
                  )}
                  {lab.whatsapp && <ProfileField label={t('labs.whatsapp') ?? 'WhatsApp'} value={lab.whatsapp} />}
                </ProfileSection>
              )}

              {/* Location */}
              {(lab.address || lab.city || lab.province || lab.country || lab.latitude != null || lab.googleMapsUrl) && (
                <ProfileSection title={t('labs.sectionLocation') ?? 'Location'}>
                  {lab.address && <ProfileField label={t('labs.address') ?? 'Address'} value={lab.address} />}
                  {lab.city && <ProfileField label={t('labs.city') ?? 'City'} value={lab.city} />}
                  {lab.province && <ProfileField label={t('labs.province') ?? 'Province'} value={lab.province} />}
                  {lab.district && <ProfileField label={t('labs.district') ?? 'District'} value={lab.district} />}
                  {lab.country && <ProfileField label={t('labs.country') ?? 'Country'} value={lab.country} />}
                  <MapLink
                    url={lab.googleMapsUrl ?? null}
                    latitude={lab.latitude ?? null}
                    longitude={lab.longitude ?? null}
                    label={t('labs.viewOnMap') ?? 'View on Map'}
                  />
                </ProfileSection>
              )}

              {/* Hours */}
              <ProfileSection title={t('labs.sectionHours') ?? 'Hours'}>
                <HoursTable
                  hours={lab.openingHours ?? null}
                  is247={Boolean(lab.is247)}
                  closedLabel={t('labs.closed') ?? 'Closed'}
                />
              </ProfileSection>

              {/* Contact Person */}
              {(lab.contactPersonName || lab.contactPersonRole || lab.contactPersonPhone) && (
                <ProfileSection title={t('labs.sectionContactPerson') ?? 'Contact Person'}>
                  {lab.contactPersonName && (
                    <ProfileField label={t('labs.contactName') ?? 'Name'} value={lab.contactPersonName} />
                  )}
                  {lab.contactPersonRole && (
                    <ProfileField label={t('labs.contactRole') ?? 'Role'} value={lab.contactPersonRole} />
                  )}
                  {lab.contactPersonPhone && (
                    <ProfileField label={t('labs.contactPhone') ?? 'Phone'} value={lab.contactPersonPhone} />
                  )}
                </ProfileSection>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {lab && (
              <>
                {/* Navigation buttons */}
                <Button
                  variant="outline"
                  onClick={() => router.push(`/labs/${lab.id}`)}
                >
                  {t('labs.viewFullRecord') ?? 'Full Record'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/labs/${lab.id}/staff`)}
                >
                  {t('labs.viewStaff') ?? 'Staff'}
                </Button>

                {/* Edit */}
                <Button
                  variant="outline"
                  onClick={() => { onEdit(lab); onOpenChange(false) }}
                >
                  {t('common.edit') ?? 'Edit'}
                </Button>

                {/* Restore (ARCHIVED only) */}
                {isArchived && (
                  <Button
                    variant="outline"
                    onClick={handleRestore}
                    disabled={actionPending}
                  >
                    {t('labs.restore') ?? 'Restore'}
                  </Button>
                )}

                {/* Status-dependent approval buttons — hidden for ARCHIVED */}
                {!isArchived && lab.status === 'PENDING' && (
                  <Button
                    onClick={() => handleReview('APPROVE')}
                    disabled={actionPending}
                  >
                    {t('labs.approve') ?? 'Approve'}
                  </Button>
                )}
                {!isArchived && lab.status === 'ACTIVE' && (
                  <Button
                    variant="destructive"
                    onClick={() => setSuspendConfirmOpen(true)}
                    disabled={actionPending}
                  >
                    {t('labs.suspend') ?? 'Suspend'}
                  </Button>
                )}
                {!isArchived && lab.status === 'SUSPENDED' && (
                  <Button
                    onClick={() => handleReview('REACTIVATE')}
                    disabled={actionPending}
                  >
                    {t('labs.reactivate') ?? 'Reactivate'}
                  </Button>
                )}

                {/* Archive — hidden for already-archived labs */}
                {!isArchived && (
                  <Button
                    variant="destructive"
                    onClick={() => setArchiveConfirmOpen(true)}
                    disabled={actionPending}
                  >
                    {t('common.archive') ?? 'Archive'}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('labs.archiveConfirmTitle') ?? 'Archive lab?'}</DialogTitle>
            <DialogDescription>
              {t('labs.archiveConfirmDesc') ?? 'This lab will be hidden from active lists. You can restore it later.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveConfirmOpen(false)} disabled={actionPending}>
              {t('common.cancel') ?? 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={actionPending}>
              {t('common.confirm') ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend confirmation dialog */}
      <Dialog open={suspendConfirmOpen} onOpenChange={setSuspendConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('labs.suspendConfirmTitle') ?? 'Suspend lab?'}</DialogTitle>
            <DialogDescription>
              {t('labs.suspendConfirmDesc') ?? 'This lab will be suspended and cannot operate until reactivated.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="suspend-reason" className="text-sm text-muted-foreground">
              {t('labs.suspendReason') ?? 'Reason (optional)'}
            </label>
            <textarea
              id="suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendConfirmOpen(false)} disabled={actionPending}>
              {t('common.cancel') ?? 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReview('SUSPEND', suspendReason || undefined)}
              disabled={actionPending}
            >
              {t('labs.confirmSuspend') ?? 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
