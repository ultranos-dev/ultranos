import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { PriceCard } from '@/components/pharmacy/PriceCard'

beforeEach(async () => {
  await db.open(); await db.drugBrandsMirror.clear(); await db.drugBrandPresentationsMirror.clear()
})

describe('PriceCard', () => {
  it('renders nothing when there is no reference price', async () => {
    const { container } = render(<PriceCard atc="X" />)
    await waitFor(() => expect(container.querySelector('[data-testid="price-card"]')).toBeNull())
  })

  it('shows the indicative minimum reference price', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.put({ id: 'p1', brandId: 'b1', referencePrice: 8.25, currency: 'AFN' } as never)
    render(<PriceCard atc="J01CA04" />)
    const card = await waitFor(() => screen.getByTestId('price-card'))
    expect(card.textContent).toContain('AFN')
    expect(card.textContent).toContain('8.25')
  })
})
