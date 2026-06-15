import { db } from '@/lib/db'
import type { CashDrawer } from './types'

export interface OpenCashDrawerParams {
  openedBy: string
  openingBalance: number
  notes?: string
}

/**
 * Opens a new cash drawer. Throws if one is already open.
 */
export async function openCashDrawer(
  params: OpenCashDrawerParams
): Promise<CashDrawer> {
  const { openedBy, openingBalance, notes } = params

  const existing = await db.cashDrawers
    .where('status')
    .equals('open')
    .first()

  if (existing) {
    throw new Error('A cash drawer is already open. Close it before opening a new one.')
  }

  const drawer: CashDrawer = {
    id: crypto.randomUUID(),
    openedBy,
    openedAt: new Date().toISOString(),
    openingBalance,
    status: 'open',
    cashIn: 0,
    cashOut: 0,
    notes,
  }

  await db.cashDrawers.add(drawer)
  return drawer
}

export interface CloseCashDrawerParams {
  drawerId: string
  closingBalance: number
  notes?: string
}

/**
 * Closes a cash drawer, computing expected balance and discrepancy.
 * expectedBalance = openingBalance + cashIn - cashOut
 * discrepancy = closingBalance - expectedBalance
 */
export async function closeCashDrawer(
  params: CloseCashDrawerParams
): Promise<CashDrawer> {
  const { drawerId, closingBalance, notes } = params

  const drawer = await db.cashDrawers.get(drawerId)
  if (!drawer) {
    throw new Error(`Cash drawer not found: ${drawerId}`)
  }

  if (drawer.status === 'closed') {
    throw new Error('Cash drawer is already closed.')
  }

  const expectedBalance = drawer.openingBalance + drawer.cashIn - drawer.cashOut
  const discrepancy = closingBalance - expectedBalance

  const updated: CashDrawer = {
    ...drawer,
    status: 'closed',
    closedAt: new Date().toISOString(),
    closingBalance,
    expectedBalance,
    discrepancy,
    notes: notes ?? drawer.notes,
  }

  await db.cashDrawers.put(updated)
  return updated
}

/**
 * Returns the currently open cash drawer, or null if none is open.
 */
export async function getOpenCashDrawer(): Promise<CashDrawer | null> {
  const drawer = await db.cashDrawers
    .where('status')
    .equals('open')
    .first()

  return drawer ?? null
}

/**
 * Returns recent closed drawers, ordered by most recently opened first.
 */
export async function getRecentDrawers(limit = 10): Promise<CashDrawer[]> {
  const drawers = await db.cashDrawers
    .where('status')
    .equals('closed')
    .reverse()
    .sortBy('openedAt')

  return drawers.slice(0, limit)
}
