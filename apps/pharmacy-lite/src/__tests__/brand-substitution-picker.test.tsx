import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '@/lib/db'
import { BrandSubstitutionPicker } from '@/components/pharmacy/BrandSubstitutionPicker'

beforeEach(async () => {
  await db.open(); await db.drugBrandsMirror.clear(); await db.drugBrandPresentationsMirror.clear()
})

describe('BrandSubstitutionPicker', () => {
  it('falls back to free-text when no atc is given', () => {
    const selected: unknown[] = []
    render(<BrandSubstitutionPicker atc={undefined} value="" onSelect={(s) => selected.push(s)} />)
    const input = screen.getByTestId('brand-freetext')
    fireEvent.change(input, { target: { value: 'Generic Co' } })
    expect(selected.at(-1)).toEqual({ brandName: 'Generic Co' })
  })

  it('renders brand options from the mirror and emits a selection', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.put({ id: 'p1', brandId: 'b1', strength: '500mg', referencePrice: 12.5, currency: 'AFN' } as never)
    const selected: unknown[] = []
    render(<BrandSubstitutionPicker atc="J01CA04" value="" onSelect={(s) => selected.push(s)} />)
    const select = await waitFor(() => screen.getByTestId('brand-select'))
    fireEvent.change(select, { target: { value: 'b1::p1' } })
    expect(selected.at(-1)).toMatchObject({ brandId: 'b1', brandName: 'Amoxil', presentationId: 'p1' })
  })
})
