'use client'

/**
 * EscalationContactsPanel — Story 48.4 (AC: 4, 5, 6)
 *
 * Configure medical director and district health officer contacts
 * for the escalation chain. The ordering physician contact is resolved
 * dynamically per-order and is NOT configured here.
 *
 * Access control: only LAB_MANAGER and physician roles can modify.
 * Phone validation: digits, optional +country code prefix.
 * Persists to Dexie `escalation_contacts` table.
 *
 * PHI: no patient data. Contact details are purely operational configuration.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getEscalationContacts, putEscalationContact } from '@/lib/db'
import type { EscalationContact } from '@/lib/db'

interface ContactFormState {
  name: string
  phone: string
  dirty: boolean
  saving: boolean
  error: string | null
  saved: boolean
}

const ALLOWED_ROLES: string[] = [LabRole.LAB_MANAGER, 'physician']

const EMPTY_FORM: ContactFormState = {
  name: '',
  phone: '',
  dirty: false,
  saving: false,
  error: null,
  saved: false,
}

/** Basic phone validation: optional +, then digits, spaces, hyphens. Min 7 digits. */
function isValidPhone(value: string): boolean {
  if (!value.trim()) return true // phone is optional
  const stripped = value.replace(/[\s\-()]/g, '')
  return /^\+?[0-9]{7,15}$/.test(stripped)
}

type ContactRole = 'medical_director' | 'district_officer'

const CONTACT_ROLES: ContactRole[] = ['medical_director', 'district_officer']

export function EscalationContactsPanel() {
  const t = useTranslations('escalation.contacts')
  const session = useAuthSessionStore((s) => s.session)
  const canEdit = session?.labRole ? ALLOWED_ROLES.includes(session.labRole) : false

  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Record<ContactRole, ContactFormState>>({
    medical_director: { ...EMPTY_FORM },
    district_officer: { ...EMPTY_FORM },
  })

  const load = useCallback(async () => {
    try {
      const contacts = await getEscalationContacts()
      setForms((prev) => {
        const next = { ...prev }
        for (const role of CONTACT_ROLES) {
          const contact = contacts.find((c) => c.role === role)
          if (contact) {
            next[role] = {
              ...EMPTY_FORM,
              name: contact.name,
              phone: contact.phone ?? '',
            }
          }
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateField = (role: ContactRole, field: 'name' | 'phone', value: string) => {
    if (!canEdit) return
    setForms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [field]: value, dirty: true, error: null, saved: false },
    }))
  }

  const save = async (role: ContactRole) => {
    const form = forms[role]
    if (!form.dirty || form.saving) return

    if (!form.name.trim()) {
      setForms((prev) => ({
        ...prev,
        [role]: { ...prev[role], error: t('nameRequired') },
      }))
      return
    }

    if (!isValidPhone(form.phone)) {
      setForms((prev) => ({
        ...prev,
        [role]: { ...prev[role], error: t('invalidPhone') },
      }))
      return
    }

    setForms((prev) => ({ ...prev, [role]: { ...prev[role], saving: true, error: null } }))

    try {
      const contact: EscalationContact = {
        role,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        updatedAt: new Date().toISOString(),
      }
      await putEscalationContact(contact)
      setForms((prev) => ({
        ...prev,
        [role]: { ...prev[role], saving: false, dirty: false, saved: true },
      }))
      // Clear "Saved" badge after 3 seconds
      setTimeout(() => {
        setForms((prev) => ({ ...prev, [role]: { ...prev[role], saved: false } }))
      }, 3000)
    } catch {
      setForms((prev) => ({
        ...prev,
        [role]: { ...prev[role], saving: false, error: t('saveError') },
      }))
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 p-4">{t('loading')}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{t('title')}</h2>
      </div>

      <p className="text-sm text-gray-500">{t('description')}</p>

      {CONTACT_ROLES.map((role) => {
        const form = forms[role]
        return (
          <div key={role} className="rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">{t(`role.${role}`)}</h3>
              {form.saved && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  {t('saved')}
                </span>
              )}
            </div>

            {form.error && (
              <p role="alert" className="text-sm text-red-600">
                {form.error}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Name */}
              <div>
                <label
                  htmlFor={`${role}-name`}
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  {t('nameLabel')}
                  <span className="ms-1 text-red-500" aria-hidden="true">*</span>
                </label>
                <input
                  id={`${role}-name`}
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField(role, 'name', e.target.value)}
                  disabled={!canEdit}
                  placeholder={t('namePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  aria-required="true"
                />
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor={`${role}-phone`}
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  {t('phoneLabel')}
                </label>
                <input
                  id={`${role}-phone`}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField(role, 'phone', e.target.value)}
                  disabled={!canEdit}
                  placeholder={t('phonePlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  autoComplete="tel"
                />
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => save(role)}
                  disabled={!form.dirty || form.saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {form.saving ? t('saving') : t('save')}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {!canEdit && (
        <p className="text-xs text-gray-500">{t('readOnlyNotice')}</p>
      )}

      {/* Info box: physician contact is per-order */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        {t('physicianNote')}
      </div>
    </div>
  )
}
