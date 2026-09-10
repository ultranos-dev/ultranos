'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useLabOrderStore } from '@/stores/lab-order-store'
import type { LabOrderInput } from '@/lib/lab-order-mapper'
import {
  LAB_TEST_CATALOG,
  LAB_ORDER_PRIORITIES,
  type LabOrderPriority,
} from '@/lib/lab-test-catalog'

interface LabOrderEntryProps {
  encounterId: string
  patientId: string
  practitionerRef: string
  disabled?: boolean
}

const inputClasses =
  'w-full rounded-xl border border-border bg-background ps-4 pe-4 py-2.5 ' +
  'text-base text-foreground placeholder:text-muted-foreground ' +
  'transition-colors focus:outline-none focus:ring-2 ' +
  'focus:border-primary focus:ring-ring ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const CATEGORIES = ['Hematology', 'Chemistry', 'Endocrine', 'Microbiology', 'Urinalysis'] as const

export function LabOrderEntry({ encounterId, patientId, practitionerRef, disabled }: LabOrderEntryProps) {
  const t = useTranslations('labOrder')

  const pendingOrders = useLabOrderStore((s) => s.pendingOrders)
  const addLabOrder = useLabOrderStore((s) => s.addLabOrder)
  const cancelLabOrder = useLabOrderStore((s) => s.cancelLabOrder)
  const loadOrders = useLabOrderStore((s) => s.loadOrders)

  const [testCode, setTestCode] = useState('')
  const [priority, setPriority] = useState<LabOrderPriority>('routine')
  const [reasonText, setReasonText] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (encounterId) void loadOrders(encounterId)
  }, [encounterId, loadOrders])

  const priorityLabel = useCallback(
    (p: LabOrderPriority) => t(`priority_${p}`),
    [t],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (isSubmitting) return
      setValidationError(null)
      setSubmitError(null)

      const selected = LAB_TEST_CATALOG.find((item) => item.code === testCode)
      if (!selected) {
        setValidationError(t('errorTestRequired'))
        return
      }

      const input: LabOrderInput = {
        testCode: selected.code,
        testDisplay: selected.display,
        priority,
        ...(reasonText.trim() ? { reasonText: reasonText.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(specialInstructions.trim() ? { specialInstructions: specialInstructions.trim() } : {}),
      }

      setIsSubmitting(true)
      try {
        await addLabOrder(input, encounterId, patientId, practitionerRef)
        setTestCode('')
        setPriority('routine')
        setReasonText('')
        setSpecialInstructions('')
        setNote('')
      } catch {
        setSubmitError(t('errorSave'))
      } finally {
        setIsSubmitting(false)
      }
    },
    [addLabOrder, encounterId, isSubmitting, note, patientId, practitionerRef, priority, reasonText, specialInstructions, t, testCode],
  )

  return (
    <div className="space-y-4">
      <h3 className="text-2xl font-semibold tracking-tight text-foreground">{t('title')}</h3>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl ring-[0.65px] ring-border/50 bg-muted p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="lab-test" className="mb-1 block text-sm font-semibold text-foreground">
              {t('test')}
            </label>
            <select
              id="lab-test"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              disabled={disabled}
              className={inputClasses}
              aria-label={t('test')}
            >
              <option value="">{t('selectTest')}</option>
              {CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {LAB_TEST_CATALOG.filter((item) => item.category === cat).map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.display}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lab-priority" className="mb-1 block text-sm font-semibold text-foreground">
              {t('priority')}
            </label>
            <select
              id="lab-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as LabOrderPriority)}
              disabled={disabled}
              className={inputClasses}
              aria-label={t('priority')}
            >
              {LAB_ORDER_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="lab-reason" className="mb-1 block text-sm font-semibold text-foreground">
            {t('reason')}
          </label>
          <input
            id="lab-reason"
            type="text"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder={t('reasonPlaceholder')}
            maxLength={500}
            disabled={disabled}
            className={inputClasses}
            aria-label={t('reason')}
          />
        </div>

        <div>
          <label htmlFor="lab-special" className="mb-1 block text-sm font-semibold text-foreground">
            {t('specialInstructions')}
          </label>
          <input
            id="lab-special"
            type="text"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder={t('specialInstructionsPlaceholder')}
            maxLength={300}
            disabled={disabled}
            className={inputClasses}
            aria-label={t('specialInstructions')}
          />
        </div>

        {validationError && (
          <p className="text-sm font-semibold text-destructive" role="alert">{validationError}</p>
        )}
        {submitError && (
          <p className="text-sm font-semibold text-destructive" role="alert">{submitError}</p>
        )}

        <Button variant="primary" type="submit" disabled={disabled || isSubmitting}>
          {isSubmitting ? t('saving') : t('addOrder')}
        </Button>
      </form>

      {pendingOrders.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <ul className="divide-y divide-border">
            {pendingOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{order.code.text ?? order.code.coding?.[0]?.display}</p>
                  {order.priority && order.priority !== 'routine' && (
                    <span className="text-xs font-semibold uppercase text-destructive">{priorityLabel(order.priority as LabOrderPriority)}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit shrink-0 px-2"
                  onClick={() => void cancelLabOrder(order.id)}
                  disabled={disabled}
                  aria-label={t('cancel')}
                >
                  {t('cancel')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
