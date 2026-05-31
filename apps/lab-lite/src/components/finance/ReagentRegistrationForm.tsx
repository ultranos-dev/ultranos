'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { addReagentInventory, enqueueSyncEvent } from '@/lib/db'
import { ReagentStatus } from '@/lib/db'
import type { ReagentInventoryEntry } from '@/lib/db'
import { reportReagentEvent } from '@/lib/audit-client'
import { hlc, serializeHlc } from '@/lib/hlc'
import { LOINC_CATEGORIES } from '@/lib/loinc-categories'

const UNIT_OPTIONS = ['bottle', 'kit', 'cassette', 'strip pack', 'vial', 'box'] as const

interface ReagentRegistrationFormProps {
  /** If provided, the form is in edit mode for an existing reagent. */
  editEntry?: ReagentInventoryEntry
  onSuccess?: (reagentId: string) => void
}

export function ReagentRegistrationForm({
  editEntry,
  onSuccess,
}: ReagentRegistrationFormProps) {
  const t = useTranslations('finance.reagent.registration')
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)

  const today = new Date().toISOString().slice(0, 10)

  const [name, setName] = useState(editEntry?.name ?? '')
  const [lotNumber, setLotNumber] = useState(editEntry?.lotNumber ?? '')
  const [manufacturer, setManufacturer] = useState(editEntry?.manufacturer ?? '')
  const [openDate, setOpenDate] = useState(editEntry?.openDate ?? today)
  const [expiryDate, setExpiryDate] = useState(editEntry?.expiryDate ?? '')
  const [expectedTests, setExpectedTests] = useState(
    editEntry?.expectedTests != null ? String(editEntry.expectedTests) : '',
  )
  const [unit, setUnit] = useState(editEntry?.unit ?? 'bottle')
  const [costPerUnit, setCostPerUnit] = useState(
    editEntry?.costPerUnit != null ? String(editEntry.costPerUnit) : '',
  )
  const [linkedTestCode, setLinkedTestCode] = useState(
    editEntry?.linkedTestCode ?? '',
  )
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const validate = useCallback((): string[] => {
    const errs: string[] = []
    if (!name.trim()) errs.push(t('errorNameRequired'))
    if (!lotNumber.trim()) errs.push(t('errorLotNumberRequired'))
    if (!expiryDate) errs.push(t('errorExpiryRequired'))
    if (expiryDate && expiryDate <= openDate) errs.push(t('errorExpiryAfterOpen'))
    const tests = parseInt(expectedTests, 10)
    if (!expectedTests || isNaN(tests) || tests <= 0) errs.push(t('errorExpectedTestsPositive'))
    const cost = parseFloat(costPerUnit)
    if (!costPerUnit || isNaN(cost) || cost < 0) errs.push(t('errorCostNonNegative'))
    if (!linkedTestCode) errs.push(t('errorTestCodeRequired'))
    return errs
  }, [name, lotNumber, openDate, expiryDate, expectedTests, costPerUnit, linkedTestCode, t])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const errs = validate()
      if (errs.length > 0) {
        setErrors(errs)
        return
      }
      setErrors([])
      setSubmitting(true)

      try {
        const reagentId = editEntry?.reagentId ?? crypto.randomUUID()
        const now = new Date().toISOString()
        const hlcTs = serializeHlc(hlc.now())

        const entry: Omit<ReagentInventoryEntry, 'id'> = {
          reagentId,
          name: name.trim(),
          lotNumber: lotNumber.trim(),
          manufacturer: manufacturer.trim() || undefined,
          openDate,
          expiryDate,
          expectedTests: parseInt(expectedTests, 10),
          testsPerformed: editEntry?.testsPerformed ?? 0,
          unit,
          costPerUnit: parseFloat(costPerUnit),
          status: editEntry?.status ?? ReagentStatus.ACTIVE,
          disposalDate: editEntry?.disposalDate ?? null,
          disposalReason: editEntry?.disposalReason ?? null,
          disposalNotes: editEntry?.disposalNotes ?? null,
          remainingAtDisposal: editEntry?.remainingAtDisposal ?? null,
          linkedTestCode,
          hlcTimestamp: hlcTs,
          createdAt: editEntry?.createdAt ?? now,
          syncStatus: 'pending',
        }

        await addReagentInventory(entry)

        await enqueueSyncEvent({
          resourceType: 'ReagentInventory',
          resourceId: reagentId,
          payload: entry,
          hlcTimestamp: hlcTs,
        })

        reportReagentEvent({
          action: 'REAGENT_REGISTERED',
          reagentId,
          lotNumber: lotNumber.trim(),
          actorId: session?.userId,
        })

        onSuccess?.(reagentId)
        router.push(`/finance/reagents/${reagentId}`)
      } finally {
        setSubmitting(false)
      }
    },
    [
      validate,
      editEntry,
      name,
      lotNumber,
      manufacturer,
      openDate,
      expiryDate,
      expectedTests,
      unit,
      costPerUnit,
      linkedTestCode,
      session,
      onSuccess,
      router,
    ],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold">{t('title')}</h2>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 space-y-1"
        >
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {/* Reagent name */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-name">
          {t('name')} <span aria-hidden>*</span>
        </label>
        <input
          id="reagent-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Lot number */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-lot">
          {t('lotNumber')} <span aria-hidden>*</span>
        </label>
        <input
          id="reagent-lot"
          type="text"
          required
          value={lotNumber}
          onChange={(e) => setLotNumber(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Manufacturer (optional) */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-manufacturer">
          {t('manufacturer')}
        </label>
        <input
          id="reagent-manufacturer"
          type="text"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Open date */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-open-date">
          {t('openDate')} <span aria-hidden>*</span>
        </label>
        <input
          id="reagent-open-date"
          type="date"
          required
          value={openDate}
          max={today}
          onChange={(e) => setOpenDate(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Expiry date */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-expiry">
          {t('expiryDate')} <span aria-hidden>*</span>
        </label>
        <input
          id="reagent-expiry"
          type="date"
          required
          value={expiryDate}
          min={openDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Expected tests */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-expected-tests">
          {t('expectedTests')} <span aria-hidden>*</span>
        </label>
        <input
          id="reagent-expected-tests"
          type="number"
          required
          min={1}
          value={expectedTests}
          onChange={(e) => setExpectedTests(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Unit type */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-unit">
          {t('unit')} <span aria-hidden>*</span>
        </label>
        <select
          id="reagent-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {/* Cost per unit (AFN) */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-cost">
          {t('costPerUnit')} <span aria-hidden>*</span>
        </label>
        <input
          id="reagent-cost"
          type="number"
          required
          min={0}
          step="0.01"
          value={costPerUnit}
          onChange={(e) => setCostPerUnit(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Linked test code */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="reagent-test-code">
          {t('linkedTestCode')} <span aria-hidden>*</span>
        </label>
        <select
          id="reagent-test-code"
          required
          value={linkedTestCode}
          onChange={(e) => setLinkedTestCode(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t('selectTestCode')}</option>
          {LOINC_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? t('saving') : t('save')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/finance/reagents')}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
