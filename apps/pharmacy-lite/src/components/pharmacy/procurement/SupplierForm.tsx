'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { createSupplier, updateSupplier } from '@/lib/procurement/supplier-service'
import type { Supplier } from '@/lib/procurement/types'

interface SupplierFormProps {
  supplier?: Supplier
  onSaved: () => void
  onCancel: () => void
}

export function SupplierForm({ supplier, onSaved, onCancel }: SupplierFormProps) {
  const t = useTranslations('procurement')
  const [name, setName] = useState(supplier?.name ?? '')
  const [contactName, setContactName] = useState(supplier?.contactName ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [leadTimeDays, setLeadTimeDays] = useState(supplier?.leadTimeDays?.toString() ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [paymentTerms, setPaymentTerms] = useState(supplier?.paymentTerms ?? '')
  const [paymentTermsDays, setPaymentTermsDays] = useState(supplier?.paymentTermsDays?.toString() ?? '')
  const [supplierCode, setSupplierCode] = useState(supplier?.supplierCode ?? '')
  const [taxId, setTaxId] = useState(supplier?.taxId ?? '')
  const [minOrderValue, setMinOrderValue] = useState(supplier?.minOrderValue?.toString() ?? '')
  const [rating, setRating] = useState(supplier?.rating?.toString() ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!supplier

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('supplierNameRequired'))
      return
    }
    setSaving(true)
    setError(null)

    try {
      const params = {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        paymentTermsDays: paymentTermsDays ? parseInt(paymentTermsDays, 10) : undefined,
        supplierCode: supplierCode.trim() || undefined,
        taxId: taxId.trim() || undefined,
        minOrderValue: minOrderValue ? parseInt(minOrderValue, 10) : undefined,
        rating: rating ? parseInt(rating, 10) : undefined,
        notes: notes.trim() || undefined,
      }

      if (isEdit) {
        await updateSupplier(supplier.id, params)
      } else {
        await createSupplier(params)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedSaveSupplier'))
    } finally {
      setSaving(false)
    }
  }

  const inputClasses =
    'w-full rounded-lg border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground ' +
    'focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {isEdit ? t('editSupplier') : t('addSupplier')}
      </h2>

      {error && (
        <div className="rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {t('supplierName')} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('supplierName')}
            className={inputClasses}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">{t('contactPerson')}</label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder={t('contactPerson')}
            className={inputClasses}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('phone')}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+964 xxx xxx xxxx"
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supplier@example.com"
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">{t('address')}</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t('address')}
            rows={2}
            className={inputClasses}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {t('leadTimeDays')}
            </label>
            <input
              type="number"
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(e.target.value)}
              placeholder="e.g. 7"
              min={0}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('paymentTerms')}</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30"
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('paymentTermsDays')}</label>
            <input
              type="number"
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
              placeholder="e.g. 30"
              min={0}
              className={inputClasses}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('supplierCode')}</label>
            <input
              type="text"
              value={supplierCode}
              onChange={(e) => setSupplierCode(e.target.value)}
              placeholder={t('supplierCode')}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('taxId')}</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder={t('taxId')}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('minOrderValue')}</label>
            <input
              type="number"
              value={minOrderValue}
              onChange={(e) => setMinOrderValue(e.target.value)}
              placeholder="e.g. 10000"
              min={0}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">{t('rating')}</label>
            <input
              type="number"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder="1–5"
              min={1}
              max={5}
              className={inputClasses}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">{t('notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notes')}
            rows={2}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : isEdit ? t('updateSupplier') : t('createSupplier')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
