import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const syncDrugCatalog = vi.fn(async () => {})
vi.mock('@/lib/drug-catalog-sync', () => ({ syncDrugCatalog }))

beforeEach(() => { syncDrugCatalog.mockClear() })

describe('useDrugCatalogSync', () => {
  it('fires syncDrugCatalog on mount', async () => {
    const { useDrugCatalogSync } = await import('@/hooks/useDrugCatalogSync')
    renderHook(() => useDrugCatalogSync())
    expect(syncDrugCatalog).toHaveBeenCalledTimes(1)
  })
})
