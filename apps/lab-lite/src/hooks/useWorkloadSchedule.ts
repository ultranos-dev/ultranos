'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getOrders, type LabOrderEntry } from '@/lib/db'
import {
  tagPendingTests,
  calculatePowerBudget,
  generateSchedule,
  detectTimeWarnings,
  type WorkloadSchedule,
  type PowerBudget,
  type TimeWarning,
  type PendingOrder,
} from '@/lib/workload-scheduler'

export interface UseWorkloadScheduleResult {
  schedule: WorkloadSchedule | null
  budget: PowerBudget | null
  warnings: TimeWarning[]
  timeWarnings: TimeWarning[]
  isLoading: boolean
  hasSchedule: boolean
  refresh: () => void
}

/** Flatten lab orders into PendingOrder shape for the scheduler. */
function ordersToPending(orders: LabOrderEntry[]): PendingOrder[] {
  const pending: PendingOrder[] = []
  for (const order of orders) {
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') continue
    for (const test of order.testsRequested) {
      pending.push({
        loincCode: test.loincCode,
        urgency: order.urgency,
        patientRef: order.patientRef,
      })
    }
  }
  return pending
}

export function useWorkloadSchedule(): UseWorkloadScheduleResult {
  const [schedule, setSchedule] = useState<WorkloadSchedule | null>(null)
  const [budget, setBudget] = useState<PowerBudget | null>(null)
  const [warnings, setWarnings] = useState<TimeWarning[]>([])
  const [timeWarnings, setTimeWarnings] = useState<TimeWarning[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasSchedule, setHasSchedule] = useState(false)
  const cancelledRef = useRef(false)

  const compute = useCallback(async () => {
    setIsLoading(true)
    try {
      const today = new Date()
      const powerBudget = await calculatePowerBudget(today)

      // F09: check cancellation after every async boundary before touching state
      if (cancelledRef.current) return

      if (!powerBudget) {
        setHasSchedule(false)
        setSchedule(null)
        setBudget(null)
        setWarnings([])
        setTimeWarnings([])
        return
      }

      // Get pending orders from Dexie
      const orders = await getOrders()
      if (cancelledRef.current) return

      const pending = ordersToPending(orders)
      const tagged = await tagPendingTests(pending)
      if (cancelledRef.current) return

      // All async work done — safe to batch state updates
      const workloadSchedule = generateSchedule(tagged, powerBudget)
      const tw = detectTimeWarnings(workloadSchedule, powerBudget)

      setHasSchedule(true)
      setBudget(powerBudget)
      setSchedule(workloadSchedule)
      setWarnings(workloadSchedule.warnings)
      setTimeWarnings(tw)
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    compute()
    return () => {
      cancelledRef.current = true
    }
  }, [compute])

  const refresh = useCallback(() => {
    // F09: reset cancellation flag so state updates aren't silently blocked after an unmount/remount
    cancelledRef.current = false
    compute()
  }, [compute])

  return { schedule, budget, warnings, timeWarnings, isLoading, hasSchedule, refresh }
}
