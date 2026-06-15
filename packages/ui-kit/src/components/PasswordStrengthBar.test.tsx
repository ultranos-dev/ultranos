import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasswordStrengthBar, getPasswordStrength } from './PasswordStrengthBar'

describe('getPasswordStrength', () => {
  it('returns 0 for empty string', () => {
    expect(getPasswordStrength('')).toBe(0)
  })

  it('returns 0 when length < 8', () => {
    expect(getPasswordStrength('abc')).toBe(0)
  })

  it('returns 1 for length >= 8 only', () => {
    expect(getPasswordStrength('abcdefgh')).toBe(1)
  })

  it('returns 2 for length + uppercase', () => {
    expect(getPasswordStrength('Abcdefgh')).toBe(2)
  })

  it('returns 3 for length + uppercase + number', () => {
    expect(getPasswordStrength('Abcdefg1')).toBe(3)
  })

  it('returns 4 for all criteria (length + upper + number + symbol)', () => {
    expect(getPasswordStrength('Abcdefg1!')).toBe(4)
  })
})

describe('PasswordStrengthBar', () => {
  it('has invisible class when strength is 0', () => {
    const { container } = render(<PasswordStrengthBar strength={0} label="Weak" />)
    expect(container.firstChild).toHaveClass('invisible')
  })

  it('does not have invisible class when strength > 0', () => {
    const { container } = render(<PasswordStrengthBar strength={1} label="Weak" />)
    expect(container.firstChild).not.toHaveClass('invisible')
  })

  it('renders label text when strength > 0', () => {
    render(<PasswordStrengthBar strength={2} label="Fair" />)
    expect(screen.getByText('Fair')).toBeInTheDocument()
  })

  it('renders 4 segment divs', () => {
    const { container } = render(<PasswordStrengthBar strength={3} label="Good" />)
    const segmentContainer = container.querySelector('[data-testid="strength-segments"]')
    expect(segmentContainer?.children).toHaveLength(4)
  })

  it('fills correct number of segments for strength=1 (bg-destructive)', () => {
    const { container } = render(<PasswordStrengthBar strength={1} label="Weak" />)
    const segs = container.querySelectorAll('[data-testid="strength-segment"]')
    const filled = Array.from(segs).filter((el) => el.className.includes('bg-destructive'))
    expect(filled).toHaveLength(1)
  })

  it('fills correct number of segments for strength=2 (bg-warning)', () => {
    const { container } = render(<PasswordStrengthBar strength={2} label="Fair" />)
    const segs = container.querySelectorAll('[data-testid="strength-segment"]')
    const filled = Array.from(segs).filter((el) => el.className.includes('bg-warning'))
    expect(filled).toHaveLength(2)
  })

  it('fills all 4 segments for strength=4 (bg-primary)', () => {
    const { container } = render(<PasswordStrengthBar strength={4} label="Strong" />)
    const segs = container.querySelectorAll('[data-testid="strength-segment"]')
    const filled = Array.from(segs).filter((el) => el.className.includes('bg-primary'))
    expect(filled).toHaveLength(4)
  })
})
