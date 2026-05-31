'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

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
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'ACTIVE'
          ? 'bg-success-subtle text-success'
          : 'bg-surface text-text-secondary'
      }`}
    >
      {status}
    </span>
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

      if (editingSupplier) {
        await trpc.admin.updateSupplier.mutate({
          id: editingSupplier.id,
          name: formName.trim(),
          contactEmail: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          leadTimeDays: formLeadTime ? parseInt(formLeadTime) : null,
        })
      } else {
        await trpc.admin.createSupplier.mutate({
          name: formName.trim(),
          contactEmail: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          leadTimeDays: formLeadTime ? parseInt(formLeadTime) : undefined,
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
          <button
            onClick={openCreate}
            className="rounded-full bg-brand-lime px-5 py-2.5 text-sm font-semibold text-brand-lime-contrast hover:scale-[1.02] transition-transform duration-200"
          >
            Add Supplier
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {loading ? (
          <div className="mt-6 text-text-secondary">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-text-secondary">No suppliers registered yet.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black text-white">
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide">Lead Time (days)</th>
                  <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-4 py-3 font-medium">{supplier.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{supplier.contactEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-text-secondary">{supplier.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-text-secondary">{supplier.leadTimeDays ?? '—'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={supplier.status} /></td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(supplier)}
                          className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent-subtle transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(supplier)}
                          className={`rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors ${
                            supplier.status === 'ACTIVE'
                              ? 'hover:bg-danger-subtle hover:text-danger'
                              : 'hover:bg-success-subtle hover:text-success'
                          }`}
                        >
                          {supplier.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add/Edit Supplier Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-text-primary">
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="sup-name" className="block text-sm font-medium text-text-primary">
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="sup-name"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label htmlFor="sup-email" className="block text-sm font-medium text-text-primary">Email</label>
                  <input
                    id="sup-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label htmlFor="sup-phone" className="block text-sm font-medium text-text-primary">Phone</label>
                  <input
                    id="sup-phone"
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label htmlFor="sup-lead" className="block text-sm font-medium text-text-primary">Lead Time (days)</label>
                  <input
                    id="sup-lead"
                    type="number"
                    min="0"
                    value={formLeadTime}
                    onChange={(e) => setFormLeadTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!formName.trim() || submitting}
                  className="rounded-full bg-brand-lime px-6 py-2.5 text-sm font-semibold text-brand-lime-contrast disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
                >
                  {submitting ? 'Saving...' : editingSupplier ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
