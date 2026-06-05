'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createSupplier, updateSupplier } from '@/lib/procurement/supplier-service'
import type { Supplier } from '@/lib/procurement/types'

interface SupplierFormProps {
  supplier?: Supplier
  onSaved: () => void
  onCancel: () => void
}

export function SupplierForm({ supplier, onSaved, onCancel }: SupplierFormProps) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [contactName, setContactName] = useState(supplier?.contactName ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [leadTimeDays, setLeadTimeDays] = useState(supplier?.leadTimeDays?.toString() ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [paymentTerms, setPaymentTerms] = useState(supplier?.paymentTerms ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!supplier

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Supplier name is required')
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
      }

      if (isEdit) {
        await updateSupplier(supplier.id, params)
      } else {
        await createSupplier(params)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  const inputClasses =
    'w-full rounded-lg border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground ' +
    'focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground">
        {isEdit ? 'Edit Supplier' : 'Add Supplier'}
      </h2>

      {error && (
        <div className="rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supplier name"
            className={inputClasses}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Contact Person</label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact person name"
            className={inputClasses}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+964 xxx xxx xxxx"
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
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
          <label className="mb-1 block text-sm font-medium text-foreground">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Supplier address"
            rows={2}
            className={inputClasses}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Lead Time (days)
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
            <label className="mb-1 block text-sm font-medium text-foreground">Payment Terms</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30"
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Supplier' : 'Create Supplier'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
