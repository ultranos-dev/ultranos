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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

interface LabInitial {
  id: string
  labName?: string | null
  licenseReference?: string | null
  accreditationReference?: string | null
  // enterprise fields
  phone?: string | null
  altPhone?: string | null
  email?: string | null
  website?: string | null
  whatsapp?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  district?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  contactPersonName?: string | null
  contactPersonRole?: string | null
  contactPersonPhone?: string | null
  turnaroundTimeHours?: number | null
  homeCollection?: boolean | null
  sampleCollection?: boolean | null
  capAccredited?: boolean | null
  specialties?: string[] | null
}

interface LabFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: LabInitial
  onSaved: () => void
}

type FormState = Record<string, string | boolean>

function buildInitialState(initial?: LabInitial): FormState {
  if (!initial) return {}
  const state: FormState = {}
  const textKeys: Array<keyof LabInitial> = [
    'labName', 'licenseReference', 'accreditationReference',
    'phone', 'altPhone', 'email', 'website', 'whatsapp',
    'address', 'city', 'province', 'district', 'country',
    'contactPersonName', 'contactPersonRole', 'contactPersonPhone',
    'turnaroundTimeHours', 'latitude', 'longitude',
  ]
  for (const key of textKeys) {
    const v = initial[key]
    if (v != null) state[key] = String(v)
  }
  const boolKeys: Array<keyof LabInitial> = ['homeCollection', 'sampleCollection', 'capAccredited']
  for (const key of boolKeys) {
    state[key] = Boolean(initial[key])
  }
  const arrKeys: Array<keyof LabInitial> = ['specialties']
  for (const key of arrKeys) {
    const v = initial[key]
    state[key] = Array.isArray(v) ? v.join(', ') : v != null ? String(v) : ''
  }
  return state
}

export function LabFormModal({ open, onOpenChange, initial, onSaved }: LabFormModalProps) {
  const t = useTranslations()

  const [form, setForm] = useState<FormState>(() => buildInitialState(initial))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(buildInitialState(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const val = (key: string): string => (form[key] as string) ?? ''
  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const labNameVal = val('labName').trim()
  const licenseVal = val('licenseReference').trim()
  const canSave = labNameVal.length > 0 && licenseVal.length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}

      // Text fields — only include non-empty
      const numberFields = new Set(['turnaroundTimeHours', 'latitude', 'longitude'])
      const textKeys = [
        'labName', 'licenseReference', 'accreditationReference',
        'phone', 'altPhone', 'email', 'website', 'whatsapp',
        'address', 'city', 'province', 'district', 'country',
        'contactPersonName', 'contactPersonRole', 'contactPersonPhone',
        'turnaroundTimeHours', 'latitude', 'longitude',
      ]
      for (const key of textKeys) {
        const v = val(key)
        if (v !== '') {
          payload[key] = numberFields.has(key) ? Number(v) : v
        }
      }

      // Boolean fields
      for (const key of ['homeCollection', 'sampleCollection', 'capAccredited']) {
        payload[key] = Boolean(form[key])
      }

      // Array fields
      const specialtiesRaw = val('specialties')
      if (specialtiesRaw !== '') {
        payload['specialties'] = specialtiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      }

      if (initial) {
        await trpc.admin.updateLab.mutate({ labId: initial.id, ...payload })
      } else {
        await trpc.admin.createLab.mutate(payload)
      }
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? (t('labs.editLab') ?? 'Edit Lab') : (t('labs.createLab') ?? 'Create Lab')}
          </DialogTitle>
          <DialogDescription className="sr-only">Create or edit lab details</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Identity */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('labs.sectionIdentity') ?? 'Identity'}
            </h4>
            <div className="flex flex-col gap-1">
              <Label htmlFor="labName">{t('labs.labName')}</Label>
              <Input id="labName" value={val('labName')} onChange={(e) => set('labName', e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="licenseReference">{t('labs.licenseReference')}</Label>
              <Input id="licenseReference" value={val('licenseReference')} onChange={(e) => set('licenseReference', e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="accreditationReference">{t('labs.accreditationReference')}</Label>
              <Input id="accreditationReference" value={val('accreditationReference')} onChange={(e) => set('accreditationReference', e.target.value)} />
            </div>
            {/* Boolean fields in identity section */}
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form['capAccredited'])}
                onChange={(e) => set('capAccredited', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              {t('labs.capAccredited') ?? 'CAP Accredited'}
            </label>
          </section>

          {/* Operational */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('labs.sectionOperational') ?? 'Operational'}
            </h4>
            <div className="flex flex-col gap-1">
              <Label htmlFor="turnaroundTimeHours">{t('labs.turnaroundTimeHours')}</Label>
              <Input id="turnaroundTimeHours" value={val('turnaroundTimeHours')} onChange={(e) => set('turnaroundTimeHours', e.target.value)} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form['homeCollection'])}
                onChange={(e) => set('homeCollection', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              {t('labs.homeCollection') ?? 'Home Collection'}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form['sampleCollection'])}
                onChange={(e) => set('sampleCollection', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              {t('labs.sampleCollection') ?? 'Sample Collection'}
            </label>
            <div className="flex flex-col gap-1">
              <Label htmlFor="specialties">{t('labs.specialties') ?? 'Specialties'}</Label>
              <Input
                id="specialties"
                value={val('specialties')}
                onChange={(e) => set('specialties', e.target.value)}
                placeholder={t('common.commaSeparated') ?? 'Comma separated'}
              />
            </div>
          </section>

          {/* Contact */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('labs.sectionContact') ?? 'Contact'}
            </h4>
            <div className="flex flex-col gap-1">
              <Label htmlFor="phone">{t('labs.phone')}</Label>
              <Input id="phone" value={val('phone')} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="altPhone">{t('labs.altPhone')}</Label>
              <Input id="altPhone" value={val('altPhone')} onChange={(e) => set('altPhone', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="email">{t('labs.email')}</Label>
              <Input id="email" value={val('email')} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="website">{t('labs.website')}</Label>
              <Input id="website" value={val('website')} onChange={(e) => set('website', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="whatsapp">{t('labs.whatsapp')}</Label>
              <Input id="whatsapp" value={val('whatsapp')} onChange={(e) => set('whatsapp', e.target.value)} />
            </div>
          </section>

          {/* Location */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('labs.sectionLocation') ?? 'Location'}
            </h4>
            <div className="flex flex-col gap-1">
              <Label htmlFor="address">{t('labs.address')}</Label>
              <Input id="address" value={val('address')} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="city">{t('labs.city')}</Label>
              <Input id="city" value={val('city')} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="province">{t('labs.province')}</Label>
              <Input id="province" value={val('province')} onChange={(e) => set('province', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="district">{t('labs.district')}</Label>
              <Input id="district" value={val('district')} onChange={(e) => set('district', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="country">{t('labs.country')}</Label>
              <Input id="country" value={val('country')} onChange={(e) => set('country', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="latitude">{t('labs.latitude')}</Label>
              <Input id="latitude" value={val('latitude')} onChange={(e) => set('latitude', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="longitude">{t('labs.longitude')}</Label>
              <Input id="longitude" value={val('longitude')} onChange={(e) => set('longitude', e.target.value)} />
            </div>
          </section>

          {/* Contact Person */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('labs.sectionContactPerson') ?? 'Contact Person'}
            </h4>
            <div className="flex flex-col gap-1">
              <Label htmlFor="contactPersonName">{t('labs.contactName')}</Label>
              <Input id="contactPersonName" value={val('contactPersonName')} onChange={(e) => set('contactPersonName', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="contactPersonRole">{t('labs.contactRole')}</Label>
              <Input id="contactPersonRole" value={val('contactPersonRole')} onChange={(e) => set('contactPersonRole', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="contactPersonPhone">{t('labs.contactPhone')}</Label>
              <Input id="contactPersonPhone" value={val('contactPersonPhone')} onChange={(e) => set('contactPersonPhone', e.target.value)} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel') ?? 'Cancel'}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('common.save') ?? 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
