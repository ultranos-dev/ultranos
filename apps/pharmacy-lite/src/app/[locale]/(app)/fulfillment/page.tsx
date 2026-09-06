'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FulfillmentChecklist } from '@/components/pharmacy/FulfillmentChecklist'
import { useFulfillmentStore, type FulfillmentItem } from '@/stores/fulfillment-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export default function FulfillmentPage() {
  const router = useRouter()
  const phase = useFulfillmentStore((s) => s.phase)

  // No prescription loaded (e.g. direct navigation / refresh) → send back to scan.
  useEffect(() => {
    if (phase === 'empty') router.replace('/scan')
  }, [phase, router])

  // Orchestrate the dispense once the modal's safety gates (allergy /
  // interaction / recall) have been acknowledged and confirmed.
  const handleConfirm = useCallback(async (_selected: FulfillmentItem[]) => {
    const store = useFulfillmentStore.getState()

    let practitionerRef: string
    try {
      practitionerRef = useAuthSessionStore.getState().getPractitionerRef()
    } catch {
      // Session expired — the store's confirmDispense guard also surfaces this.
      router.replace('/login')
      return
    }

    // 1. Pick earliest-expiry (FEFO) batches for the selected items.
    await store.assignFefoBatches()
    // 2. Safety-critical write: persist dispense locally → audit → sync to Hub.
    await store.confirmDispense()
    // 3. Best-effort stock decrement + invoice creation (both swallow errors).
    await store.deductStockOnDispense(practitionerRef)
    await store.createInvoiceAfterDispense(practitionerRef)
  }, [router])

  if (phase === 'empty') return null

  return <FulfillmentChecklist onConfirm={handleConfirm} />
}
