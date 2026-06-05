'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from '@ultranos/ui-kit/icons'
import { MyOrdersView } from '@/components/procurement/MyOrdersView'
import { ResupplyRequestForm } from '@/components/procurement/ResupplyRequestForm'

export default function ProcurementPage() {
  const t = useTranslations('procurement')
  const [showForm, setShowForm] = useState(false)

  if (showForm) {
    return (
      <div className="mx-auto max-w-2xl">
        <ResupplyRequestForm
          onSuccess={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('form.title')}</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Plus size={16} />
          {t('form.review')}
        </button>
      </div>
      <MyOrdersView />
    </div>
  )
}
