import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StarRating, MapLink, TagList } from '@/components/facilities/primitives'

describe('facility primitives', () => {
  it('StarRating shows dash when no rating', () => {
    render(<StarRating rating={null} reviewCount={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
  it('MapLink hidden when no url/coords', () => {
    const { container } = render(<MapLink url={null} latitude={null} longitude={null} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('TagList renders chips', () => {
    render(<TagList items={['Cardiology','Pediatrics']} />)
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
  })
})
