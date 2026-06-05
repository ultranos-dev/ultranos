'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  getChecklistTemplates,
  putChecklistTemplate,
  deleteChecklistTemplate,
  deactivateChecklistTemplate,
  resetChecklistTemplatesToDefaults,
} from '@/lib/db'
import { CHECKLIST_CATEGORIES } from '@/lib/safety/default-checklist'
import type { ChecklistItemTemplate } from '@/types/infection-control-audit'

const NEW_CATEGORY_VALUE = '__new__'

export function ChecklistTemplateEditor() {
  const t = useTranslations('safety.audit')
  const session = useAuthSessionStore((s) => s.session)

  const [templates, setTemplates] = useState<ChecklistItemTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Add form state
  const [addCategory, setAddCategory] = useState<string>(CHECKLIST_CATEGORIES[0])
  const [addNewCategory, setAddNewCategory] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addRequiresPhoto, setAddRequiresPhoto] = useState(false)
  const [addOrder, setAddOrder] = useState(1)
  const [addError, setAddError] = useState('')

  // Edit form state
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editNewCategory, setEditNewCategory] = useState('')
  const [editRequiresPhoto, setEditRequiresPhoto] = useState(false)

  const isManager = session?.labRole === LabRole.LAB_MANAGER

  async function loadTemplates() {
    setLoading(true)
    const items = await getChecklistTemplates()
    setTemplates(items)
    setLoading(false)
  }

  useEffect(() => {
    if (!isManager) return
    void loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager])

  if (!isManager) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {t('accessRestricted')}
      </div>
    )
  }

  function computeDefaultOrder(items: ChecklistItemTemplate[]) {
    if (items.length === 0) return 1
    return Math.max(...items.map((i) => i.order)) + 1
  }

  function openAddForm() {
    setAddCategory(CHECKLIST_CATEGORIES[0])
    setAddNewCategory('')
    setAddDescription('')
    setAddRequiresPhoto(false)
    setAddOrder(computeDefaultOrder(templates))
    setAddError('')
    setShowAddForm(true)
  }

  async function handleAdd() {
    const resolvedCategory =
      addCategory === NEW_CATEGORY_VALUE ? addNewCategory.trim() : addCategory
    if (!resolvedCategory) {
      setAddError(t('errorCategoryRequired'))
      return
    }
    if (!addDescription.trim()) {
      setAddError(t('errorDescriptionRequired'))
      return
    }
    const newItem: ChecklistItemTemplate = {
      id: crypto.randomUUID(),
      category: resolvedCategory,
      description: addDescription.trim(),
      order: addOrder,
      isDefault: false,
      requiresPhoto: addRequiresPhoto,
      isActive: true,
    }
    await putChecklistTemplate(newItem)
    setShowAddForm(false)
    await loadTemplates()
  }

  function startEdit(item: ChecklistItemTemplate) {
    setEditingId(item.id)
    setEditDescription(item.description)
    setEditCategory(item.category)
    setEditNewCategory('')
    setEditRequiresPhoto(item.requiresPhoto)
  }

  async function handleSaveEdit(item: ChecklistItemTemplate) {
    const resolvedCategory =
      editCategory === NEW_CATEGORY_VALUE ? editNewCategory.trim() : editCategory
    if (!resolvedCategory || !editDescription.trim()) return
    const updated: ChecklistItemTemplate = {
      ...item,
      description: editDescription.trim(),
      category: resolvedCategory,
      requiresPhoto: editRequiresPhoto,
    }
    await putChecklistTemplate(updated)
    setEditingId(null)
    await loadTemplates()
  }

  async function handleDelete(id: string) {
    await deleteChecklistTemplate(id)
    await loadTemplates()
  }

  async function handleToggleActive(item: ChecklistItemTemplate) {
    if (item.isActive) {
      await deactivateChecklistTemplate(item.id)
    } else {
      // Re-activate: put back with isActive: true
      await putChecklistTemplate({ ...item, isActive: true })
    }
    await loadTemplates()
  }

  async function handleReset() {
    await resetChecklistTemplatesToDefaults()
    setShowResetConfirm(false)
    await loadTemplates()
  }

  // Group by category
  const allCategories = Array.from(new Set(templates.map((t) => t.category))).sort()
  const grouped: Record<string, ChecklistItemTemplate[]> = {}
  for (const cat of allCategories) {
    grouped[cat] = templates
      .filter((item) => item.category === cat)
      .sort((a, b) => a.order - b.order)
  }

  const categoryOptions = [
    ...CHECKLIST_CATEGORIES,
    ...allCategories.filter((c) => !CHECKLIST_CATEGORIES.includes(c)),
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold">{t('templateEditorTitle')}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openAddForm}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {t('addItem')}
          </button>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            {t('resetToDefaults')}
          </button>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex flex-col gap-3"
        >
          <p id="reset-dialog-title" className="text-sm font-medium text-amber-800">
            {t('resetConfirmMessage')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              {t('confirmReset')}
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Add item form */}
      {showAddForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-blue-800">{t('addItemTitle')}</h3>

          {addError && (
            <p className="text-xs text-red-600" role="alert">
              {addError}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">{t('fieldCategory')}</label>
            <select
              value={addCategory}
              onChange={(e) => {
                setAddCategory(e.target.value)
                setAddError('')
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>{t('newCategory')}</option>
            </select>
            {addCategory === NEW_CATEGORY_VALUE && (
              <input
                type="text"
                value={addNewCategory}
                onChange={(e) => setAddNewCategory(e.target.value)}
                placeholder={t('newCategoryPlaceholder')}
                className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">{t('fieldDescription')}</label>
            <input
              type="text"
              value={addDescription}
              onChange={(e) => {
                setAddDescription(e.target.value)
                setAddError('')
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="add-requires-photo"
              type="checkbox"
              checked={addRequiresPhoto}
              onChange={(e) => setAddRequiresPhoto(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            />
            <label htmlFor="add-requires-photo" className="text-sm text-gray-700">
              {t('fieldRequiresPhoto')}
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">{t('fieldOrder')}</label>
            <input
              type="number"
              value={addOrder}
              onChange={(e) => setAddOrder(Number(e.target.value))}
              min={1}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('save')}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" aria-busy="true" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-gray-500">{t('noTemplates')}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {allCategories.map((category) => (
            <section key={category} aria-labelledby={`cat-heading-${category}`}>
              <h3
                id={`cat-heading-${category}`}
                className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500"
              >
                {category}
              </h3>
              <ul className="flex flex-col gap-2">
                {(grouped[category] ?? []).map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-lg border p-3 ${
                      item.isActive
                        ? 'border-gray-200 bg-card'
                        : 'border-gray-100 bg-gray-50 opacity-60'
                    }`}
                  >
                    {editingId === item.id && !item.isDefault ? (
                      /* Inline edit form for custom items */
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-600">
                            {t('fieldCategory')}
                          </label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          >
                            {categoryOptions.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            <option value={NEW_CATEGORY_VALUE}>{t('newCategory')}</option>
                          </select>
                          {editCategory === NEW_CATEGORY_VALUE && (
                            <input
                              type="text"
                              value={editNewCategory}
                              onChange={(e) => setEditNewCategory(e.target.value)}
                              placeholder={t('newCategoryPlaceholder')}
                              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-600">
                            {t('fieldDescription')}
                          </label>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id={`edit-photo-${item.id}`}
                            type="checkbox"
                            checked={editRequiresPhoto}
                            onChange={(e) => setEditRequiresPhoto(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600"
                          />
                          <label
                            htmlFor={`edit-photo-${item.id}`}
                            className="text-sm text-gray-700"
                          >
                            {t('fieldRequiresPhoto')}
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item)}
                            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            {t('save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Read view */
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1 min-w-0">
                          <p className="text-sm text-gray-800 break-words">{item.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {item.requiresPhoto && (
                              <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                                {t('badgeRequiresPhoto')}
                              </span>
                            )}
                            {!item.isActive && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                                {t('badgeInactive')}
                              </span>
                            )}
                            {item.isDefault && (
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                                {t('badgeDefault')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-1.5">
                          {item.isDefault ? (
                            /* Default items: Deactivate / Activate only */
                            <button
                              type="button"
                              onClick={() => handleToggleActive(item)}
                              className={`rounded px-2 py-1 text-xs font-medium ${
                                item.isActive
                                  ? 'border border-amber-300 text-amber-700 hover:bg-amber-50'
                                  : 'border border-green-300 text-green-700 hover:bg-green-50'
                              }`}
                            >
                              {item.isActive ? t('deactivate') : t('activate')}
                            </button>
                          ) : (
                            /* Custom items: Edit + Delete */
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                {t('edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                {t('delete')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
