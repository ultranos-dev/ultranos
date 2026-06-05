import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../components/ui/empty-state.js'
import { Users } from '../icons.js'

describe('EmptyState', () => {
  it('snapshot — md size, all props', () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No patients found"
        description="Try adjusting your search or filters."
        action={{ label: 'Clear filters', onClick: vi.fn() }}
        size="md"
      />,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('snapshot — sm size with all props', () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No prescriptions"
        description="Nothing dispensed today."
        action={{ label: 'Clear', onClick: vi.fn() }}
        size="sm"
      />,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('uses Inbox icon as fallback when icon prop is omitted', () => {
    const { container } = render(<EmptyState title="No records yet" />)
    const svgEl = container.querySelector('svg[aria-hidden="true"]')
    expect(svgEl).not.toBeNull()
  })

  it('renders no button when action prop is omitted', () => {
    render(<EmptyState title="No results" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('snapshot — RTL md', () => {
    const { container } = render(
      <div dir="rtl">
        <EmptyState
          title="لا توجد نتائج"
          description="حاول تعديل بحثك."
          action={{ label: 'مسح', onClick: vi.fn() }}
          size="md"
        />
      </div>,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('snapshot — RTL sm', () => {
    const { container } = render(
      <div dir="rtl">
        <EmptyState
          title="لا توجد وصفات"
          description="لم يتم صرف أي شيء اليوم."
          action={{ label: 'مسح', onClick: vi.fn() }}
          size="sm"
        />
      </div>,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('action button is a <button> element with a visible label', () => {
    render(
      <EmptyState
        title="No results"
        action={{ label: 'Clear filters', onClick: vi.fn() }}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Clear filters' }),
    ).toBeInTheDocument()
  })
})
