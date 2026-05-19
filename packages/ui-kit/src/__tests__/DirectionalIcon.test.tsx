import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DirectionalIcon } from '../components/DirectionalIcon'

describe('DirectionalIcon', () => {
  it('renders children in a span', () => {
    const { container } = render(
      <DirectionalIcon>
        <svg data-testid="icon" />
      </DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.querySelector('svg')).not.toBeNull()
  })

  it('sets aria-hidden="true" by default', () => {
    const { container } = render(
      <DirectionalIcon>←</DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span?.getAttribute('aria-hidden')).toBe('true')
  })

  it('applies transform CSS variable for navigation category', () => {
    const { container } = render(
      <DirectionalIcon category="navigation">←</DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span?.style.transform).toBe('var(--directional-icon-transform, none)')
  })

  it('does NOT apply transform for medical category', () => {
    const { container } = render(
      <DirectionalIcon category="medical">💊</DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span?.style.transform).toBe('')
  })

  it('does NOT apply transform for neutral category (default)', () => {
    const { container } = render(
      <DirectionalIcon>✓</DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span?.style.transform).toBe('')
  })

  it('passes className through', () => {
    const { container } = render(
      <DirectionalIcon className="custom-class" category="navigation">←</DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span?.classList.contains('custom-class')).toBe(true)
  })

  it('merges additional styles', () => {
    const { container } = render(
      <DirectionalIcon style={{ color: 'red' }} category="navigation">←</DirectionalIcon>,
    )
    const span = container.querySelector('span')
    expect(span?.style.color).toBe('red')
    expect(span?.style.transform).toBe('var(--directional-icon-transform, none)')
  })
})
