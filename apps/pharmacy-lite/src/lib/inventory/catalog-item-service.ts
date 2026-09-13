import { db } from '@/lib/db'
import type { CatalogItem, MedicationForm, ControlledSchedule } from './types'

export interface CatalogItemInput {
  name: string
  nameLocal?: string
  form: MedicationForm
  strength: string
  strengthUnit: string
  packSize: number
  barcode?: string
  category: string
  controlledSchedule?: ControlledSchedule
  defaultSellingPrice: number // minor units
  wholesalePrice?: number     // minor units
  reorderPoint: number
  reorderQuantity?: number
}

function validate(input: Partial<CatalogItemInput>): void {
  if (input.name !== undefined && input.name.trim().length === 0) throw new Error('Name is required')
  if (input.packSize !== undefined && (!Number.isFinite(input.packSize) || input.packSize <= 0)) throw new Error('Pack size must be a positive number')
  if (input.reorderPoint !== undefined && (!Number.isFinite(input.reorderPoint) || input.reorderPoint < 0)) throw new Error('Reorder point must be zero or more')
  if (input.defaultSellingPrice !== undefined && (!Number.isFinite(input.defaultSellingPrice) || input.defaultSellingPrice < 0)) throw new Error('Price must be zero or more')
  if (input.wholesalePrice !== undefined && (!Number.isFinite(input.wholesalePrice) || input.wholesalePrice < 0)) throw new Error('Wholesale price must be zero or more')
  if (input.reorderQuantity !== undefined && (!Number.isFinite(input.reorderQuantity) || input.reorderQuantity < 0)) throw new Error('Reorder quantity must be zero or more')
}

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  validate(input)
  const now = new Date().toISOString()
  const item: CatalogItem = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    nameLocal: input.nameLocal?.trim() || undefined,
    form: input.form,
    strength: input.strength.trim(),
    strengthUnit: input.strengthUnit.trim(),
    packSize: input.packSize,
    barcode: input.barcode?.trim() || undefined,
    category: input.category.trim(),
    controlledSchedule: input.controlledSchedule,
    defaultSellingPrice: input.defaultSellingPrice,
    wholesalePrice: input.wholesalePrice,
    reorderPoint: input.reorderPoint,
    reorderQuantity: input.reorderQuantity,
    isActive: true,
    lastSyncedAt: now,
    locallyModified: true,
    source: 'local',
  }
  await db.catalogItems.put(item)
  return item
}

export async function updateCatalogItem(id: string, updates: Partial<CatalogItemInput>): Promise<void> {
  validate(updates)
  const clean: Record<string, unknown> = { ...updates, locallyModified: true }
  if (typeof updates.name === 'string') clean.name = updates.name.trim()
  await db.catalogItems.update(id, clean)
}

export async function deactivateCatalogItem(id: string): Promise<void> {
  await db.catalogItems.update(id, { isActive: false, locallyModified: true })
}

export async function reactivateCatalogItem(id: string): Promise<void> {
  await db.catalogItems.update(id, { isActive: true, locallyModified: true })
}
