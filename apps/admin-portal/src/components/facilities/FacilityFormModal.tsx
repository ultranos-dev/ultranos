'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  ModalHeader,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { FacilityKindConfig } from './config'

type AnyFacilityKindConfig = Pick<
  FacilityKindConfig,
  'key' | 'i18nNs' | 'typeOptions' | 'createFn' | 'updateFn'
> & {
  extraBooleanFields?: { name: string; label: string }[]
  extraArrayFields?: { name: string; label: string }[]
  extraFields?: { name: string; label: string }[]
}

interface FacilityFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kindConfig: AnyFacilityKindConfig
  initial?: Record<string, unknown> & { id: string }
  onSaved: () => void
}

type FormState = Record<string, string | boolean>

function buildInitialState(
  initial: Record<string, unknown> | undefined,
  booleanFields: { name: string }[],
  arrayFields: { name: string }[],
): FormState {
  if (!initial) return {}
  const state: FormState = {}
  const textKeys = [
    'name', 'description', 'licenseRef', 'logoUrl', 'establishedYear',
    'phone', 'altPhone', 'email', 'website', 'whatsapp',
    'address', 'province', 'district', 'city', 'postalCode', 'country',
    'latitude', 'longitude',
    'contactPersonName', 'contactPersonRole', 'contactPersonPhone',
    'facilityType',
  ]
  for (const key of textKeys) {
    if (initial[key] != null) state[key] = String(initial[key])
  }
  for (const { name } of booleanFields) {
    state[name] = Boolean(initial[name])
  }
  for (const { name } of arrayFields) {
    const v = initial[name]
    state[name] = Array.isArray(v) ? v.join(', ') : v != null ? String(v) : ''
  }
  return state
}

export function FacilityFormModal({
  open,
  onOpenChange,
  kindConfig,
  initial,
  onSaved,
}: FacilityFormModalProps) {
  const t = useTranslations(kindConfig.i18nNs)

  const boolFields = kindConfig.extraBooleanFields ?? []
  const arrFields = kindConfig.extraArrayFields ?? []

  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(initial, boolFields, arrFields)
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(buildInitialState(initial, boolFields, arrFields))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const val = (key: string): string => (form[key] as string) ?? ''
  const set = (key: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const nameValue = val('name').trim()
  const canSave = nameValue.length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}

      // Text fields — only include non-empty
      const numberFields = new Set(['establishedYear', 'latitude', 'longitude'])
      const textKeys = [
        'name', 'description', 'licenseRef', 'logoUrl', 'establishedYear',
        'phone', 'altPhone', 'email', 'website', 'whatsapp',
        'address', 'province', 'district', 'city', 'postalCode', 'country',
        'latitude', 'longitude',
        'contactPersonName', 'contactPersonRole', 'contactPersonPhone',
        'facilityType',
      ]
      for (const key of textKeys) {
        const v = val(key)
        if (v !== '') {
          payload[key] = numberFields.has(key) ? Number(v) : v
        }
      }

      // Boolean fields
      for (const { name } of boolFields) {
        payload[name] = Boolean(form[name])
      }

      // Array fields — split on comma, trim, filter empty
      for (const { name } of arrFields) {
        const raw = val(name)
        if (raw !== '') {
          payload[name] = raw.split(',').map((s) => s.trim()).filter(Boolean)
        }
      }

      if (initial) {
        await kindConfig.updateFn({ id: initial.id, ...payload })
      } else {
        await kindConfig.createFn(payload)
      }
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function TextField({ id, required }: { id: string; required?: boolean }) {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{t(id)}</Label>
        <Input
          id={id}
          value={val(id)}
          onChange={(e) => set(id, e.target.value)}
          required={required}
        />
      </div>
    )
  }

  function TextAreaField({ id }: { id: string }) {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{t(id)}</Label>
        <Textarea
          id={id}
          value={val(id)}
          onChange={(e) => set(id, e.target.value)}
        />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" hideClose>
        <ModalHeader title={initial ? t('editFacility') : t('createFacility')} tone="primary" inset dialog />

        <div className="flex flex-col gap-4">
          {/* Identity */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('sectionIdentity')}
            </h4>
            <TextField id="name" required />
            <TextAreaField id="description" />
            <TextField id="licenseRef" />
            <TextField id="logoUrl" />
            <TextField id="establishedYear" />
            {kindConfig.typeOptions && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="facilityType">{t('facilityType')}</Label>
                <select
                  id="facilityType"
                  value={val('facilityType')}
                  onChange={(e) => set('facilityType', e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">{t('selectType')}</option>
                  {kindConfig.typeOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {/* Contact */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('sectionContact')}
            </h4>
            <TextField id="phone" />
            <TextField id="altPhone" />
            <TextField id="email" />
            <TextField id="website" />
            <TextField id="whatsapp" />
          </section>

          {/* Location */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('sectionLocation')}
            </h4>
            <TextField id="address" />
            <TextField id="province" />
            <TextField id="district" />
            <TextField id="city" />
            <TextField id="postalCode" />
            <TextField id="country" />
            <TextField id="latitude" />
            <TextField id="longitude" />
          </section>

          {/* Contact person */}
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('sectionContactPerson')}
            </h4>
            <TextField id="contactPersonName" />
            <TextField id="contactPersonRole" />
            <TextField id="contactPersonPhone" />
          </section>

          {/* Extra boolean fields */}
          {boolFields.length > 0 && (
            <section className="flex flex-col gap-2">
              {boolFields.map(({ name, label }) => (
                <label key={name} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form[name])}
                    onChange={(e) => set(name, e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {t(label)}
                </label>
              ))}
            </section>
          )}

          {/* Extra array fields */}
          {arrFields.length > 0 && (
            <section className="flex flex-col gap-3">
              {arrFields.map(({ name, label }) => (
                <div key={name} className="flex flex-col gap-1">
                  <Label htmlFor={name}>{t(label)}</Label>
                  <Input
                    id={name}
                    value={val(name)}
                    onChange={(e) => set(name, e.target.value)}
                    placeholder={t('commaSeparated')}
                  />
                </div>
              ))}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
