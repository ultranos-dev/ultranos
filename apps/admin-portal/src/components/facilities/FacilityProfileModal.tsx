'use client'
import { useState, useEffect } from 'react'
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
} from './primitives'
import type { FacilityKindConfig } from './config'

interface FacilityProfile {
  id: string
  name: string
  facilityType?: string | null
  isActive: boolean
  archivedAt?: string | null
  logoUrl?: string | null
  googleRating?: number | null
  googleReviewCount?: number | null
  is247?: boolean
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
  // specialties / departments
  specialties?: string[] | null
  departments?: string[] | null
  // contact person
  contactPersonName?: string | null
  contactPersonRole?: string | null
  contactPersonPhone?: string | null
}

interface FacilityProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilityId: string
  kindConfig: FacilityKindConfig
  onEdit: (profile: FacilityProfile) => void
  onChanged: () => void
}

export function FacilityProfileModal({
  open,
  onOpenChange,
  facilityId,
  kindConfig,
  onEdit,
  onChanged,
}: FacilityProfileModalProps) {
  const t = useTranslations()
  const [profile, setProfile] = useState<FacilityProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setProfile(null)
    kindConfig.getDetailFn?.({ id: facilityId })
      .then((result) => {
        if (!cancelled) setProfile(result as FacilityProfile)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, facilityId, kindConfig])

  async function handleArchive() {
    if (!profile) return
    setActionPending(true)
    try {
      await kindConfig.archiveFn({ id: profile.id })
      setArchiveConfirmOpen(false)
      onOpenChange(false)
      onChanged()
    } finally {
      setActionPending(false)
    }
  }

  async function handleRestore() {
    if (!profile) return
    setActionPending(true)
    try {
      await kindConfig.restoreFn({ id: profile.id })
      onOpenChange(false)
      onChanged()
    } finally {
      setActionPending(false)
    }
  }

  const isArchived = Boolean(profile?.archivedAt)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {loading || !profile ? (
                <span className="text-muted-foreground">{t('common.loading') ?? 'Loading…'}</span>
              ) : (
                <div className="flex items-center gap-3">
                  <LogoAvatar url={profile.logoUrl ?? null} name={profile.name} size={40} />
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-semibold text-foreground">{profile.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {profile.facilityType && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {profile.facilityType}
                        </Badge>
                      )}
                      {isArchived ? (
                        <Badge variant="secondary" className="text-xs">{t('common.archived') ?? 'Archived'}</Badge>
                      ) : profile.isActive ? (
                        <Badge variant="success" className="text-xs">{t('common.active') ?? 'Active'}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{t('common.inactive') ?? 'Inactive'}</Badge>
                      )}
                      <StarRating
                        rating={profile.googleRating ?? null}
                        reviewCount={profile.googleReviewCount ?? null}
                      />
                    </div>
                  </div>
                </div>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">Facility profile and management actions</DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
              {t('common.loading') ?? 'Loading…'}
            </div>
          )}

          {!loading && profile && (
            <div className="flex flex-col gap-4">
              {/* Contact */}
              <ProfileSection title={t('facilities.sectionContact') ?? 'Contact'}>
                <ProfileField label={t('facilities.phone') ?? 'Phone'} value={profile.phone} />
                {profile.altPhone && <ProfileField label={t('facilities.altPhone') ?? 'Alt Phone'} value={profile.altPhone} />}
                {profile.email && <ProfileField label={t('facilities.email') ?? 'Email'} value={profile.email} />}
                {profile.website && (
                  <ProfileField
                    label={t('facilities.website') ?? 'Website'}
                    value={
                      <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {profile.website}
                      </a>
                    }
                  />
                )}
                {profile.whatsapp && <ProfileField label={t('facilities.whatsapp') ?? 'WhatsApp'} value={profile.whatsapp} />}
              </ProfileSection>

              {/* Location */}
              <ProfileSection title={t('facilities.sectionLocation') ?? 'Location'}>
                {profile.address && <ProfileField label={t('facilities.address') ?? 'Address'} value={profile.address} />}
                {profile.city && <ProfileField label={t('facilities.city') ?? 'City'} value={profile.city} />}
                {profile.province && <ProfileField label={t('facilities.province') ?? 'Province'} value={profile.province} />}
                {profile.district && <ProfileField label={t('facilities.district') ?? 'District'} value={profile.district} />}
                {profile.country && <ProfileField label={t('facilities.country') ?? 'Country'} value={profile.country} />}
                <MapLink
                  url={profile.googleMapsUrl ?? null}
                  latitude={profile.latitude ?? null}
                  longitude={profile.longitude ?? null}
                  label={t('facilities.viewOnMap') ?? 'View on Google Maps'}
                />
              </ProfileSection>

              {/* Hours */}
              <ProfileSection title={t('facilities.sectionHours') ?? 'Hours'}>
                <HoursTable
                  hours={profile.openingHours ?? null}
                  is247={Boolean(profile.is247)}
                  closedLabel={t('facilities.closed') ?? 'Closed'}
                />
              </ProfileSection>

              {/* Specialties / Departments */}
              {(profile.specialties?.length || profile.departments?.length) ? (
                <ProfileSection title={t('facilities.sectionServices') ?? 'Services & Specialties'}>
                  {profile.specialties?.length ? (
                    <div>
                      <span className="mb-1 block text-xs text-muted-foreground">{t('facilities.specialties') ?? 'Specialties'}</span>
                      <TagList items={profile.specialties} />
                    </div>
                  ) : null}
                  {profile.departments?.length ? (
                    <div>
                      <span className="mb-1 block text-xs text-muted-foreground">{t('facilities.departments') ?? 'Departments'}</span>
                      <TagList items={profile.departments} />
                    </div>
                  ) : null}
                </ProfileSection>
              ) : null}

              {/* Contact Person */}
              {(profile.contactPersonName || profile.contactPersonRole || profile.contactPersonPhone) ? (
                <ProfileSection title={t('facilities.sectionContactPerson') ?? 'Contact Person'}>
                  {profile.contactPersonName && <ProfileField label={t('facilities.contactName') ?? 'Name'} value={profile.contactPersonName} />}
                  {profile.contactPersonRole && <ProfileField label={t('facilities.contactRole') ?? 'Role'} value={profile.contactPersonRole} />}
                  {profile.contactPersonPhone && <ProfileField label={t('facilities.contactPhone') ?? 'Phone'} value={profile.contactPersonPhone} />}
                </ProfileSection>
              ) : null}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {profile && (
              <>
                <Button
                  variant="outline"
                  onClick={() => { onEdit(profile); onOpenChange(false) }}
                >
                  {t('common.edit') ?? 'Edit'}
                </Button>
                {isArchived ? (
                  <Button
                    variant="outline"
                    onClick={handleRestore}
                    disabled={actionPending}
                  >
                    {t('common.restore') ?? 'Restore'}
                  </Button>
                ) : (
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
            <DialogTitle>{t('facilities.archiveConfirmTitle') ?? 'Archive facility?'}</DialogTitle>
            <DialogDescription>
              {t('facilities.archiveConfirmDesc') ?? 'This facility will be hidden from active lists. You can restore it later.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveConfirmOpen(false)} disabled={actionPending}>
              {t('common.cancel') ?? 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={actionPending}>
              {t('common.archive') ?? 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
