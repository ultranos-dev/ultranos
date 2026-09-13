'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type { FhirServiceRequest } from '@ultranos/shared-types'
import { Button } from '@/components/ui/Button'
import { useLabOrderStore } from '@/stores/lab-order-store'
import { LabPicker } from '@/components/clinical/LabPicker'
import { type LabOrderInput, readLabFromServiceRequest, readLabOrderDisplay } from '@/lib/lab-order-mapper'
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

/** Priority badge colour — critical priorities use the red `destructive` token. */
function priorityBadgeClass(p: LabOrderPriority): string {
  const base = 'rounded-full px-2 py-0.5 text-xs font-semibold uppercase'
  if (p === 'stat' || p === 'asap') return `${base} bg-destructive/20 text-destructive`
  if (p === 'urgent') return `${base} bg-warning/20 text-foreground`
  return `${base} bg-muted text-muted-foreground`
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
  const updateLabOrder = useLabOrderStore((s) => s.updateLabOrder)
  const cancelLabOrder = useLabOrderStore((s) => s.cancelLabOrder)
  const loadOrders = useLabOrderStore((s) => s.loadOrders)
  const applyLabToPending = useLabOrderStore((s) => s.applyLabToPending)
  const refreshLabOrderStatuses = useLabOrderStore((s) => s.refreshLabOrderStatuses)

  // One assigned lab for the whole encounter's lab tests (optional).
  const [lab, setLab] = useState<{ id: string; name?: string } | undefined>(undefined)

  const [testCode, setTestCode] = useState('')
  const [priority, setPriority] = useState<LabOrderPriority>('routine')
  const [reasonText, setReasonText] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (encounterId) void loadOrders(encounterId)
  }, [encounterId, loadOrders])

  // Pull the Hub's processing status for the current orders so started orders
  // lock. Keyed on the SET of ids (not their contents) so a forward-merge that
  // flips a status to 'on-hold' doesn't re-trigger the fetch. Online-only;
  // offline the last-known local status is used.
  const pendingIdsKey = pendingOrders.map((o) => o.id).join(',')
  useEffect(() => {
    if (!pendingIdsKey) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    void refreshLabOrderStatuses(pendingIdsKey.split(','))
  }, [pendingIdsKey, refreshLabOrderStatuses])

  // Initialise the assigned lab from persisted orders ONCE on (re)load. The ref
  // guards against re-deriving a stale value after a user select/clear.
  const labInitRef = useRef(false)
  useEffect(() => {
    if (labInitRef.current || pendingOrders.length === 0) return
    labInitRef.current = true
    const { labId, labName } = readLabFromServiceRequest(pendingOrders[0]!)
    if (labId) setLab({ id: labId, name: labName })
  }, [pendingOrders])

  const handleSelectLab = useCallback((id: string, name: string) => {
    labInitRef.current = true
    setLab({ id, name })
    void applyLabToPending({ id, name })
  }, [applyLabToPending])

  const handleClearLab = useCallback(() => {
    labInitRef.current = true
    setLab(undefined)
    void applyLabToPending(null)
  }, [applyLabToPending])

  const priorityLabel = useCallback(
    (p: LabOrderPriority) => t(`priority_${p}`),
    [t],
  )

  const resetForm = useCallback(() => {
    setEditingId(null)
    setTestCode('')
    setPriority('routine')
    setReasonText('')
    setSpecialInstructions('')
    setNote('')
  }, [])

  // Load an existing (unlocked) order's fields into the form for editing.
  const handleEdit = useCallback((order: FhirServiceRequest) => {
    setEditingId(order.id)
    setTestCode(order.code.coding?.[0]?.code ?? '')
    setPriority((order.priority ?? 'routine') as LabOrderPriority)
    setReasonText(order.reasonCode?.[0]?.text ?? '')
    setSpecialInstructions(order._ultranos.specialInstructions ?? '')
    setNote(order.note?.[0]?.text ?? '')
    setValidationError(null)
    setSubmitError(null)
  }, [])

  const handleCancelEdit = useCallback(() => {
    resetForm()
    setValidationError(null)
    setSubmitError(null)
  }, [resetForm])

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
        // Assign the chosen lab (optional) so each new order carries performer.
        ...(lab ? { labId: lab.id, labName: lab.name } : {}),
      }

      setIsSubmitting(true)
      try {
        if (editingId) {
          await updateLabOrder(editingId, input)
        } else {
          await addLabOrder(input, encounterId, patientId, practitionerRef)
        }
        resetForm()
      } catch {
        setSubmitError(t('errorSave'))
      } finally {
        setIsSubmitting(false)
      }
    },
    [addLabOrder, updateLabOrder, editingId, encounterId, isSubmitting, note, patientId, practitionerRef, priority, reasonText, resetForm, specialInstructions, t, testCode, lab],
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

        {/* Optional: assign the encounter's lab tests to a specific lab. */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-foreground">{t('labOptional')}</label>
          <LabPicker value={lab?.id} name={lab?.name} onSelect={handleSelectLab} onClear={handleClearLab} />
        </div>

        {validationError && (
          <p className="text-sm font-semibold text-destructive" role="alert">{validationError}</p>
        )}
        {submitError && (
          <p className="text-sm font-semibold text-destructive" role="alert">{submitError}</p>
        )}

        <div className="flex items-center gap-3">
          <Button variant="primary" type="submit" disabled={disabled || isSubmitting}>
            {isSubmitting ? t('saving') : editingId ? t('updateOrder') : t('addOrder')}
          </Button>
          {editingId && (
            <Button variant="ghost" type="button" className="w-fit px-2" onClick={handleCancelEdit} disabled={isSubmitting}>
              {t('cancelEdit')}
            </Button>
          )}
        </div>
      </form>

      {pendingOrders.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <ul className="divide-y divide-border">
            {pendingOrders.map((order) => {
              const d = readLabOrderDisplay(order)
              return (
                <li key={order.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{d.testName}</span>
                      {d.code && <span className="text-xs text-muted-foreground">{d.code}</span>}
                      {d.category && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{d.category}</span>
                      )}
                      <span className={priorityBadgeClass(d.priority)}>{priorityLabel(d.priority)}</span>
                      {d.labName && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{d.labName}</span>
                      )}
                    </div>
                    {d.reason && <p className="text-sm text-muted-foreground">{d.reason}</p>}
                    {d.specialInstructions && <p className="text-xs text-muted-foreground">{d.specialInstructions}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {d.locked ? (
                      <span
                        className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-foreground"
                        title={t('lockedHint')}
                      >
                        {t('statusInProgress')}
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-fit px-2"
                          onClick={() => handleEdit(order)}
                          disabled={disabled}
                          aria-label={t('editAria')}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-fit px-2 !text-destructive"
                          onClick={() => void cancelLabOrder(order.id)}
                          disabled={disabled}
                          aria-label={t('cancel')}
                        >
                          {t('cancel')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
