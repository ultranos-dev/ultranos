import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pagination } from '@/components/pharmacy/Pagination'

describe('Pagination', () => {
  const onPageChange = vi.fn()

  it('renders nothing when totalPages is 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={onPageChange} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders page indicator', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />)
    expect(screen.getByTestId('pagination-indicator')).toHaveTextContent('Page 2 of 5')
  })

  it('disables previous button on first page', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />)
    expect(screen.getByTestId('pagination-prev')).toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={onPageChange} />)
    expect(screen.getByTestId('pagination-next')).toBeDisabled()
  })

  it('enables both buttons on middle page', () => {
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />)
    expect(screen.getByTestId('pagination-prev')).not.toBeDisabled()
    expect(screen.getByTestId('pagination-next')).not.toBeDisabled()
  })

  it('calls onPageChange with previous page', () => {
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByTestId('pagination-prev'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('calls onPageChange with next page', () => {
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByTestId('pagination-next'))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
