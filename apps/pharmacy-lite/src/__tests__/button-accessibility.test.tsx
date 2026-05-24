import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from '@/components/ui/Button'

describe('Button accessibility', () => {
  it('uses focus-visible instead of focus for ring styles', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('focus-visible:ring-2')
    expect(btn.className).not.toMatch(/(?<!-)focus:ring/)
  })

  it('does not use transition-all', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).not.toContain('transition-all')
    expect(btn.className).toContain('transition-[transform,filter,background-color]')
  })

  it('uses custom easing curve', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('ease-[cubic-bezier(0.23,1,0.32,1)]')
    expect(btn.className).not.toContain('ease-out')
  })

  it('uses motion-reduce:transition-none', () => {
    render(<Button>Test</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('motion-reduce:transition-none')
  })
})
