import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DetailLayout } from '../components/ui/detail-layout.js'

describe('DetailLayout', () => {
  it('renders banner above the grid, main, and rail', () => {
    render(
      <DetailLayout
        banner={<div data-testid="banner">allergy</div>}
        rail={<div data-testid="rail">context</div>}
      >
        <div data-testid="main">flow</div>
      </DetailLayout>,
    )
    expect(screen.getByTestId('banner')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(screen.getByTestId('rail')).toBeInTheDocument()
  })

  it('places the rail in a region so screen readers can find context', () => {
    render(
      <DetailLayout rail={<div>context</div>} railLabel="Patient context">
        <div>flow</div>
      </DetailLayout>,
    )
    expect(screen.getByRole('complementary', { name: 'Patient context' })).toBeInTheDocument()
  })

  it('omits the banner slot entirely when not provided', () => {
    const { container } = render(
      <DetailLayout rail={<div>r</div>}><div>m</div></DetailLayout>,
    )
    expect(container.querySelector('[data-slot="detail-banner"]')).toBeNull()
  })
})
