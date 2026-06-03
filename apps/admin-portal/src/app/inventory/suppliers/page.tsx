'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Supplier {
  id: string
  name: string
  contactEmail: string | null
  phone: string | null
  leadTimeDays: number | null
  status: string
  createdAt: string
  updatedAt: string
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>
      {status}
    </Badge>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formLeadTime, setFormLeadTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listSuppliers.query({})
      setSuppliers(result.suppliers as Supplier[])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  function openCreate() {
    setEditingSupplier(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormLeadTime('')
    setShowModal(true)
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier)
    setFormName(supplier.name)
    setFormEmail(supplier.contactEmail ?? '')
    setFormPhone(supplier.phone ?? '')
    setFormLeadTime(supplier.leadTimeDays?.toString() ?? '')
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!formName.trim()) return
    try {
      setSubmitting(true)
      setError(null)

      const parsedLeadTime = formLeadTime ? parseInt(formLeadTime, 10) : NaN
      const leadTimeDays = !isNaN(parsedLeadTime) && parsedLeadTime >= 0 ? parsedLeadTime : null

      if (editingSupplier) {
        await trpc.admin.updateSupplier.mutate({
          id: editingSupplier.id,
          name: formName.trim(),
          contactEmail: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          leadTimeDays,
        })
      } else {
        await trpc.admin.createSupplier.mutate({
          name: formName.trim(),
          contactEmail: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          leadTimeDays: leadTimeDays ?? undefined,
        })
      }

      setShowModal(false)
      fetchSuppliers()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save supplier')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(supplier: Supplier) {
    const newStatus = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    if (!window.confirm(`${newStatus === 'INACTIVE' ? 'Deactivate' : 'Reactivate'} supplier "${supplier.name}"?`)) return

    try {
      setError(null)
      await trpc.admin.updateSupplier.mutate({ id: supplier.id, status: newStatus })
      fetchSuppliers()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update supplier status')
    }
  }

  return (
    <>
      <TopHeader title="Suppliers" description="Manage reagent suppliers and their contact details." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <div className="flex items-center justify-end">
          <Button onClick={openCreate}>
            Add Supplier
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-muted-foreground">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">No suppliers registered yet.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-card">
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">Lead Time (days)</th>
                  <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-popover">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-4 py-3 font-medium">{supplier.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{supplier.contactEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{supplier.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{supplier.leadTimeDays ?? '—'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={supplier.status} /></td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button variant="outline" size="xs" onClick={() => openEdit(supplier)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleToggleStatus(supplier)}
                          className={supplier.status === 'ACTIVE' ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-success/10 hover:text-success'}
                        >
                          {supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add/Edit Supplier Modal */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {editingSupplier ? 'Edit supplier details.' : 'Add a new supplier.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label htmlFor="sup-name" className="block text-sm font-medium text-foreground">
                  Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="sup-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="sup-email" className="block text-sm font-medium text-foreground">Email</label>
                <Input
                  id="sup-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="sup-phone" className="block text-sm font-medium text-foreground">Phone</label>
                <Input
                  id="sup-phone"
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="sup-lead" className="block text-sm font-medium text-foreground">Lead Time (days)</label>
                <Input
                  id="sup-lead"
                  type="number"
                  min="0"
                  value={formLeadTime}
                  onChange={(e) => setFormLeadTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!formName.trim() || submitting}>
                {submitting ? 'Saving...' : editingSupplier ? 'Save Changes' : 'Add Supplier'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
