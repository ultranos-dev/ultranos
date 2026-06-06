'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'
import type { ContactRelationship, PatientContact } from '@ultranos/shared-types'

const RELATIONSHIP_OPTIONS: { value: ContactRelationship; labelKey: string }[] = [
  { value: 'SPOUSE',   labelKey: 'contactSpouse' },
  { value: 'PARENT',   labelKey: 'contactParent' },
  { value: 'SIBLING',  labelKey: 'contactSibling' },
  { value: 'CHILD',    labelKey: 'contactChild' },
  { value: 'GUARDIAN', labelKey: 'contactGuardian' },
  { value: 'FRIEND',   labelKey: 'contactFriend' },
  { value: 'OTHER',    labelKey: 'contactOther' },
]

interface EmergencyContactSectionProps {
  contacts: PatientContact[]
  onContactsChange: (contacts: PatientContact[]) => void
}

function emptyContact(): PatientContact {
  return { relationship: 'OTHER', name: '' }
}

export function EmergencyContactSection({
  contacts,
  onContactsChange,
}: EmergencyContactSectionProps) {
  const t = useTranslations('registration')
  const [keys, setKeys] = useState<string[]>(() =>
    contacts.map(() => crypto.randomUUID())
  )

  function addContact() {
    if (contacts.length < 2) {
      onContactsChange([...contacts, emptyContact()])
      setKeys(prev => [...prev, crypto.randomUUID()])
    }
  }

  function removeContact(index: number) {
    onContactsChange(contacts.filter((_, i) => i !== index))
    setKeys(prev => prev.filter((_, i) => i !== index))
  }

  function updateContact(index: number, patch: Partial<PatientContact>) {
    onContactsChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  return (
    <Card as="fieldset">
      <legend className="text-base font-bold text-foreground">
        {t('emergencyContactSection')}
        <span className="ms-1 text-xs font-normal text-muted-foreground">
          ({t('optional')})
        </span>
      </legend>

      <div className="space-y-4">
        {contacts.map((contact, index) => (
          <div
            key={keys[index] ?? index}
            className="rounded-lg border border-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {t('emergencyContactN', { n: index + 1 })}
              </p>
              <button
                type="button"
                onClick={() => removeContact(index)}
                className="text-muted-foreground hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring rounded p-1"
                aria-label={t('removeContact')}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Relationship */}
            <div>
              <label
                htmlFor={`contact-relationship-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('contactRelationship')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <select
                id={`contact-relationship-${index}`}
                value={contact.relationship}
                onChange={(e) => updateContact(index, { relationship: e.target.value as ContactRelationship })}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor={`contact-name-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('contactName')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <input
                id={`contact-name-${index}`}
                type="text"
                dir="auto"
                maxLength={200}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('contactNamePlaceholder')}
                value={contact.name}
                onChange={(e) => updateContact(index, { name: e.target.value })}
              />
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor={`contact-phone-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('contactPhone')}
                <span className="ms-1 text-xs font-normal text-muted-foreground">
                  ({t('optional')})
                </span>
              </label>
              <input
                id={`contact-phone-${index}`}
                type="tel"
                dir="ltr"
                inputMode="tel"
                maxLength={50}
                className="w-full min-h-[44px] rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('phonePlaceholder')}
                value={contact.phone ?? ''}
                onChange={(e) => updateContact(index, { phone: e.target.value || undefined })}
              />
            </div>
          </div>
        ))}

        {contacts.length < 2 && (
          <Button
            type="button"
            variant="outline"
            onClick={addContact}
            className="gap-1.5"
          >
            <Plus size={16} />
            {t('addEmergencyContact')}
          </Button>
        )}
      </div>
    </Card>
  )
}
