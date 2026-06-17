import { describe, it, expect } from 'vitest'
import type { DrugImage, DrugEntryTier1 } from '../fhir/drug-catalog'

describe('DrugImage', () => {
  it('attaches images to a Tier1 entry', () => {
    const img: DrugImage = { url: 'https://x/advil.jpg', brand: 'Advil', isPrimary: true }
    const partial: Pick<DrugEntryTier1, 'images'> = { images: [img] }
    expect(partial.images?.[0].brand).toBe('Advil')
    expect(partial.images?.[0].isPrimary).toBe(true)
  })
})
