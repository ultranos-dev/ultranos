'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import { createCatalogItem, updateCatalogItem } from '@/lib/inventory/catalog-item-service'
import type { CatalogItemInput } from '@/lib/inventory/catalog-item-service'
import type { CatalogItem, MedicationForm, ControlledSchedule } from '@/lib/inventory/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { SupplierItemsManager } from '@/components/pharmacy/inventory/SupplierItemsManager'

const MEDICATION_FORMS: MedicationForm[] = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'cream',
  'drops',
  'inhaler',
  'other',
]

const CONTROLLED_SCHEDULES: ControlledSchedule[] = ['II', 'III', 'IV', 'V']

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  item?: CatalogItem
  onSaved: () => void
}

export function CatalogItemFormDialog({ open, onOpenChange, item, onSaved }: Props) {
  const t = useTranslations('inventory')
  const isEdit = !!item

  const session = useAuthSessionStore((s) => s.session)
  const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'

  const [minorUnits, setMinorUnits] = useState(2)

  // Form fields
  const [name, setName] = useState('')
  const [nameLocal, setNameLocal] = useState('')
  const [form, setForm] = useState<MedicationForm>('tablet')
  const [strength, setStrength] = useState('')
  const [strengthUnit, setStrengthUnit] = useState('')
  const [packSize, setPackSize] = useState('1')
  const [barcode, setBarcode] = useState('')
  const [category, setCategory] = useState('')
  const [controlledSchedule, setControlledSchedule] = useState<ControlledSchedule | ''>('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [wholesalePrice, setWholesalePrice] = useState('')
  const [reorderPoint, setReorderPoint] = useState('0')
  const [reorderQuantity, setReorderQuantity] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read currencyMinorUnits once on mount
  useEffect(() => {
    db.pharmacySettings
      .toCollection()
      .first()
      .then((s) => {
        if (s?.currencyMinorUnits != null) setMinorUnits(s.currencyMinorUnits)
      })
      .catch(() => {
        // default 2 already set
      })
  }, [])

  // Reset / prefill form when dialog opens or item changes
  useEffect(() => {
    if (!open) return
    setError(null)
    if (item) {
      setName(item.name)
      setNameLocal(item.nameLocal ?? '')
      setForm(item.form)
      setStrength(item.strength)
      setStrengthUnit(item.strengthUnit)
      setPackSize(String(item.packSize))
      setBarcode(item.barcode ?? '')
      setCategory(item.category)
      setControlledSchedule(item.controlledSchedule ?? '')
      setSellingPrice((item.defaultSellingPrice / 10 ** minorUnits).toFixed(minorUnits))
      setWholesalePrice(
        item.wholesalePrice != null
          ? (item.wholesalePrice / 10 ** minorUnits).toFixed(minorUnits)
          : '',
      )
      setReorderPoint(String(item.reorderPoint))
      setReorderQuantity(item.reorderQuantity != null ? String(item.reorderQuantity) : '')
    } else {
      setName('')
      setNameLocal('')
      setForm('tablet')
      setStrength('')
      setStrengthUnit('')
      setPackSize('1')
      setBarcode('')
      setCategory('')
      setControlledSchedule('')
      setSellingPrice('')
      setWholesalePrice('')
      setReorderPoint('0')
      setReorderQuantity('')
    }
  }, [open, item, minorUnits])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(t('catalogValidationName'))
      return
    }

    const toMinor = (val: string) =>
      Math.round(parseFloat(val || '0') * 10 ** minorUnits)

    const input: CatalogItemInput = {
      name: name.trim(),
      nameLocal: nameLocal.trim() || undefined,
      form,
      strength: strength.trim(),
      strengthUnit: strengthUnit.trim(),
      packSize: parseInt(packSize, 10) || 1,
      barcode: barcode.trim() || undefined,
      category: category.trim(),
      controlledSchedule: controlledSchedule || undefined,
      defaultSellingPrice: toMinor(sellingPrice),
      wholesalePrice: wholesalePrice ? toMinor(wholesalePrice) : undefined,
      reorderPoint: parseInt(reorderPoint, 10) || 0,
      reorderQuantity: reorderQuantity ? parseInt(reorderQuantity, 10) : undefined,
    }

    setSaving(true)
    try {
      if (isEdit && item) {
        await updateCatalogItem(item.id, input)
      } else {
        await createCatalogItem(input)
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('catalogSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('catalogFormTitleEdit') : t('catalogFormTitleCreate')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('catalogFormDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-3">
            {/* Name */}
            <div className="grid gap-1">
              <Label htmlFor="catalog-form-name">{t('fieldName')} <span className="text-destructive">*</span></Label>
              <Input
                id="catalog-form-name"
                data-testid="catalog-form-name"
                dir="auto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('fieldName')}
              />
            </div>

            {/* Local name */}
            <div className="grid gap-1">
              <Label htmlFor="catalog-form-name-local">{t('fieldNameLocal')}</Label>
              <Input
                id="catalog-form-name-local"
                dir="auto"
                value={nameLocal}
                onChange={(e) => setNameLocal(e.target.value)}
                placeholder={t('fieldNameLocal')}
              />
            </div>

            {/* Form */}
            <div className="grid gap-1">
              <Label>{t('fieldForm')}</Label>
              <Select value={form} onValueChange={(v) => setForm(v as MedicationForm)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDICATION_FORMS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`medicationForm_${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Strength + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-strength">{t('fieldStrength')}</Label>
                <Input
                  id="catalog-form-strength"
                  dir="auto"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  placeholder={t('fieldStrengthPlaceholder')}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-strength-unit">{t('fieldStrengthUnit')}</Label>
                <Input
                  id="catalog-form-strength-unit"
                  dir="auto"
                  value={strengthUnit}
                  onChange={(e) => setStrengthUnit(e.target.value)}
                  placeholder={t('fieldStrengthUnitPlaceholder')}
                />
              </div>
            </div>

            {/* Pack Size + Reorder Point + Reorder Quantity */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-pack-size">{t('fieldPackSize')}</Label>
                <Input
                  id="catalog-form-pack-size"
                  type="number"
                  min={1}
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-reorder-point">{t('fieldReorderPoint')}</Label>
                <Input
                  id="catalog-form-reorder-point"
                  type="number"
                  min={0}
                  value={reorderPoint}
                  onChange={(e) => setReorderPoint(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-reorder-quantity">{t('fieldReorderQuantity')}</Label>
                <Input
                  id="catalog-form-reorder-quantity"
                  data-testid="catalog-form-reorder-quantity"
                  type="number"
                  min={0}
                  value={reorderQuantity}
                  onChange={(e) => setReorderQuantity(e.target.value)}
                />
              </div>
            </div>

            {/* Category */}
            <div className="grid gap-1">
              <Label htmlFor="catalog-form-category">{t('fieldCategory')}</Label>
              <Input
                id="catalog-form-category"
                dir="auto"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t('fieldCategory')}
              />
            </div>

            {/* Barcode */}
            <div className="grid gap-1">
              <Label htmlFor="catalog-form-barcode">{t('fieldBarcode')}</Label>
              <Input
                id="catalog-form-barcode"
                dir="auto"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder={t('fieldBarcode')}
              />
            </div>

            {/* Controlled Schedule */}
            <div className="grid gap-1">
              <Label>{t('fieldControlledSchedule')}</Label>
              <Select
                value={controlledSchedule || 'none'}
                onValueChange={(v) =>
                  setControlledSchedule(v === 'none' ? '' : (v as ControlledSchedule))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('controlledNone')}</SelectItem>
                  {CONTROLLED_SCHEDULES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t('controlledScheduleLabel', { schedule: s })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selling Price + Wholesale Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-price">{t('fieldSellingPrice')}</Label>
                <Input
                  id="catalog-form-price"
                  data-testid="catalog-form-price"
                  type="number"
                  min={0}
                  step="any"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="catalog-form-wholesale-price">{t('fieldWholesalePrice')}</Label>
                <Input
                  id="catalog-form-wholesale-price"
                  type="number"
                  min={0}
                  step="any"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              data-testid="catalog-form-submit"
              disabled={saving}
            >
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && item && (
          <div className="mt-4 border-t border-border pt-4">
            <SupplierItemsManager catalogItemId={item.id} performedBy={performedBy} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
