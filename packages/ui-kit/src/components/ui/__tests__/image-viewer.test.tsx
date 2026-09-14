import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageViewer } from '../image-viewer'

describe('ImageViewer', () => {
  it('renders the image when open and hides when closed', () => {
    const { rerender } = render(<ImageViewer src="data:image/webp;base64,AA" alt="cell" open={false} onOpenChange={() => {}} />)
    expect(screen.queryByRole('img')).toBeNull()
    rerender(<ImageViewer src="data:image/webp;base64,AA" alt="cell" open onOpenChange={() => {}} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'cell')
  })

  it('zoom-in increases scale; reset returns to 1; scale clamps at 8', () => {
    render(<ImageViewer src="data:image/webp;base64,AA" open onOpenChange={() => {}} />)
    const img = screen.getByRole('img')
    const zoomIn = screen.getByRole('button', { name: /zoom in/i })
    for (let i = 0; i < 20; i++) fireEvent.click(zoomIn)
    expect(img.style.transform).toContain('scale(8)') // clamped
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(img.style.transform).toContain('scale(1)')
  })

  it('Escape requests close', () => {
    const onOpenChange = vi.fn()
    render(<ImageViewer src="data:image/webp;base64,AA" open onOpenChange={onOpenChange} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dialog has an accessible name when open', () => {
    render(<ImageViewer src="data:image/webp;base64,AA" open onOpenChange={() => {}} />)
    expect(screen.getByRole('dialog', { name: /image viewer/i })).toBeInTheDocument()
  })
})
