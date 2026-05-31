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

      if (!powerBudget) {
        setHasSchedule(false)
        setSchedule(null)
        setBudget(null)
        setWarnings([])
        setTimeWarnings([])
        return
      }

      setHasSchedule(true)
      setBudget(powerBudget)

      // Get pending orders from Dexie
      const orders = await getOrders()
      const pending = ordersToPending(orders)
      const tagged = await tagPendingTests(pending)

      if (cancelledRef.current) return

      const workloadSchedule = generateSchedule(tagged, powerBudget)
      setSchedule(workloadSchedule)
      setWarnings(workloadSchedule.warnings)

      const tw = detectTimeWarnings(workloadSchedule, powerBudget)
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
    compute()
  }, [compute])

  return { schedule, budget, warnings, timeWarnings, isLoading, hasSchedule, refresh }
}
