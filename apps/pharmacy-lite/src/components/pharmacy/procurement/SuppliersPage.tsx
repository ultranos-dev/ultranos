'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { SupplierForm } from './SupplierForm'
import { getAllSuppliers, deactivateSupplier } from '@/lib/procurement/supplier-service'
import type { Supplier } from '@/lib/procurement/types'

type View = 'list' | 'create' | 'edit'

export function SuppliersPage() {
  const [view, setView] = useState<View>('list')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllSuppliers()
      setSuppliers(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  function handleEdit(supplier: Supplier) {
    setEditingSupplier(supplier)
    setView('edit')
  }

  async function handleDeactivate(id: string) {
    await deactivateSupplier(id)
    await loadSuppliers()
  }

  function handleSaved() {
    setView('list')
    setEditingSupplier(null)
    loadSuppliers()
  }

  function handleCancel() {
    setView('list')
    setEditingSupplier(null)
  }

  if (view === 'create') {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <SupplierForm onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  if (view === 'edit' && editingSupplier) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <SupplierForm supplier={editingSupplier} onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Suppliers</h1>
        <Button onClick={() => setView('create')}>Add Supplier</Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-neutral-500">Loading suppliers...</div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-neutral-500">No suppliers yet</p>
          <p className="mt-1 text-sm text-neutral-400">Add your first supplier to get started</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-neutral-600">Name</th>
                <th className="px-4 py-3 text-start font-medium text-neutral-600">Contact</th>
                <th className="px-4 py-3 text-start font-medium text-neutral-600">Phone</th>
                <th className="px-4 py-3 text-end font-medium text-neutral-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className={supplier.isActive ? '' : 'opacity-50'}
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">{supplier.name}</td>
                  <td className="px-4 py-3 text-neutral-600">{supplier.contactName ?? '-'}</td>
                  <td className="px-4 py-3 text-neutral-600">{supplier.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" onClick={() => handleEdit(supplier)}>
                        Edit
                      </Button>
                      {supplier.isActive && (
                        <Button variant="outline" onClick={() => handleDeactivate(supplier.id)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
