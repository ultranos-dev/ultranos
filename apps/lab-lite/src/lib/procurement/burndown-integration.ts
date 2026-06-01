/**
 * Burndown Integration — Story 52.3 Task 8
 *
 * Bridges Story 48.2 predictive burndown alerts with the resupply request form.
 * When burndown predicts stockout within a configurable threshold, this module
 * provides pre-fill data for ResupplyRequestForm.
 *
 * No PHI: reagent operational data only.
 */

import { getDb } from '../db'
import { computeUrgencyFromDaysRemaining } from './request-sync'
import type { ResupplyRequestItem } from '../db'

export interface BurndownAlert {
  reagentId: string
  reagentCode: string
  reagentDisplay: string
  currentStock: number
  unitOfMeasure: string
  daysOfSupplyRemaining: number
  dailyConsumptionRate: number // units per day
}

export interface ResupplyPrefillData {
  items: Omit<ResupplyRequestItem, 'unitPrice' | 'totalPrice'>[]
  urgency: 'routine' | 'urgent' | 'critical'
}

/** Default threshold for triggering resupply alerts (14 days — matches AC 1) */
export const RESUPPLY_ALERT_THRESHOLD_DAYS = 14

/**
 * Compute days of supply remaining for a reagent.
 * Uses actual consumption records to derive a daily rate.
 * Falls back to 0 if no consumption history exists.
 */
export async function getDaysOfSupplyRemaining(
  reagentId: string,
  currentStock: number,
  lookbackDays = 30,
): Promise<number> {
  const db = getDb()

  const since = new Date()
  since.setDate(since.getDate() - lookbackDays)

  const logs = await db.reagent_consumption_log
    .where('reagentId')
    .equals(reagentId)
    .toArray()

  const recent = logs.filter((l) => l.loggedAt >= since.toISOString())
  const totalConsumed = recent.reduce((sum, l) => sum + l.testsConsumed, 0)
  const dailyRate = lookbackDays > 0 ? totalConsumed / lookbackDays : 0

  if (dailyRate <= 0) return currentStock > 0 ? 999 : 0
  return Math.floor(currentStock / dailyRate)
}

/**
 * Get all reagents predicted to reach stockout within `thresholdDays`.
 * Returns BurndownAlert objects that can drive resupply button display.
 */
export async function getBurndownAlerts(
  thresholdDays: number = RESUPPLY_ALERT_THRESHOLD_DAYS,
): Promise<BurndownAlert[]> {
  const db = getDb()

  const activeReagents = await db.reagent_inventory
    .where('status')
    .equals('ACTIVE')
    .toArray()

  const alerts: BurndownAlert[] = []

  for (const reagent of activeReagents) {
    const daysRemaining = await getDaysOfSupplyRemaining(
      reagent.reagentId,
      reagent.expectedTests - reagent.testsPerformed,
    )

    if (daysRemaining <= thresholdDays) {
      alerts.push({
        reagentId: reagent.reagentId,
        reagentCode: reagent.linkedTestCode,
        reagentDisplay: reagent.name,
        currentStock: reagent.expectedTests - reagent.testsPerformed,
        unitOfMeasure: reagent.unit,
        daysOfSupplyRemaining: daysRemaining,
        dailyConsumptionRate: daysRemaining > 0 ? (reagent.expectedTests - reagent.testsPerformed) / daysRemaining : 0,
      })
    }
  }

  return alerts.sort((a, b) => a.daysOfSupplyRemaining - b.daysOfSupplyRemaining)
}

/**
 * Build ResupplyRequestForm pre-fill data from a burndown alert.
 * Quantity suggestion: enough for 30 days of supply.
 * Urgency auto-assigned based on days remaining.
 */
export function buildPrefillFromBurndownAlert(alert: BurndownAlert): ResupplyPrefillData {
  const suggestedQty = Math.ceil(alert.dailyConsumptionRate * 30)
  const urgency = computeUrgencyFromDaysRemaining(alert.daysOfSupplyRemaining)

  return {
    items: [
      {
        reagentCode: alert.reagentCode,
        reagentDisplay: alert.reagentDisplay,
        quantityRequested: Math.max(1, suggestedQty),
        unitOfMeasure: alert.unitOfMeasure,
        currentStock: alert.currentStock,
        daysOfSupplyRemaining: alert.daysOfSupplyRemaining,
      },
    ],
    urgency,
  }
}

/**
 * Build ResupplyRequestForm pre-fill data from an inventory entry (manual trigger).
 * No quantity suggestion — user enters manually.
 */
export function buildPrefillFromInventory(params: {
  reagentCode: string
  reagentDisplay: string
  currentStock: number
  unitOfMeasure: string
  daysOfSupplyRemaining: number
}): ResupplyPrefillData {
  const urgency = computeUrgencyFromDaysRemaining(params.daysOfSupplyRemaining)
  return {
    items: [
      {
        reagentCode: params.reagentCode,
        reagentDisplay: params.reagentDisplay,
        quantityRequested: 1,
        unitOfMeasure: params.unitOfMeasure,
        currentStock: params.currentStock,
        daysOfSupplyRemaining: params.daysOfSupplyRemaining,
      },
    ],
    urgency,
  }
}
