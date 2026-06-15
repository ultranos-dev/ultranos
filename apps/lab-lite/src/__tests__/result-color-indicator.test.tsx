/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Task 9.4: ResultColorIndicator — correct color + icon per interpretation level
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultColorIndicator } from '../components/results/ResultColorIndicator'
import type { Interpretation } from '../lib/result-interpretation'

// ---------------------------------------------------------------------------
// 9.4 — ResultColorIndicator renders correct color + icon for each level
// ---------------------------------------------------------------------------

describe('ResultColorIndicator — aria / accessibility', () => {
  it('renders with role="img" and accessible aria-label', () => {
    render(<ResultColorIndicator interpretation="normal" />)
    const el = screen.getByRole('img')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('aria-label', 'Normal')
  })

  it('uses a custom label when the label prop is provided', () => {
    render(<ResultColorIndicator interpretation="low" label="منخفض" />)
    const el = screen.getByRole('img')
    expect(el).toHaveAttribute('aria-label', 'منخفض')
    expect(el).toHaveTextContent('منخفض')
  })
})

describe('ResultColorIndicator — label text per interpretation', () => {
  const cases: Array<[Interpretation, string]> = [
    ['normal', 'Normal'],
    ['low', 'Low'],
    ['high', 'High'],
    ['critical-low', 'Critical — Low'],
    ['critical-high', 'Critical — High'],
  ]

  it.each(cases)('renders "%s" label for %s interpretation', (interp, expectedLabel) => {
    render(<ResultColorIndicator interpretation={interp} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expectedLabel)
    // Text should be visually present inside the element
    expect(screen.getByRole('img')).toHaveTextContent(expectedLabel)
  })
})

describe('ResultColorIndicator — colour classes', () => {
  it('applies green colour class for normal', () => {
    const { container } = render(<ResultColorIndicator interpretation="normal" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/text-green/)
  })

  it('applies yellow colour class for low', () => {
    const { container } = render(<ResultColorIndicator interpretation="low" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/text-yellow/)
  })

  it('applies yellow colour class for high', () => {
    const { container } = render(<ResultColorIndicator interpretation="high" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/text-yellow/)
  })

  it('applies red colour class for critical-low', () => {
    const { container } = render(<ResultColorIndicator interpretation="critical-low" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/text-red/)
  })

  it('applies red colour class for critical-high', () => {
    const { container } = render(<ResultColorIndicator interpretation="critical-high" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/text-red/)
  })
})

describe('ResultColorIndicator — coloured dot (belt-and-suspenders for colorblind users)', () => {
  it('renders a green dot for normal', () => {
    const { container } = render(<ResultColorIndicator interpretation="normal" />)
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(dot).not.toBeNull()
    expect(dot!.className).toMatch(/bg-green/)
  })

  it('renders a yellow dot for low', () => {
    const { container } = render(<ResultColorIndicator interpretation="low" />)
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(dot!.className).toMatch(/bg-yellow/)
  })

  it('renders a yellow dot for high', () => {
    const { container } = render(<ResultColorIndicator interpretation="high" />)
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(dot!.className).toMatch(/bg-yellow/)
  })

  it('renders a red dot for critical-low', () => {
    const { container } = render(<ResultColorIndicator interpretation="critical-low" />)
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(dot!.className).toMatch(/bg-red/)
  })

  it('renders a red dot for critical-high', () => {
    const { container } = render(<ResultColorIndicator interpretation="critical-high" />)
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')
    expect(dot!.className).toMatch(/bg-red/)
  })
})

describe('ResultColorIndicator — SVG shape icon (shape-redundant for colorblind users)', () => {
  it('renders an SVG icon element for every interpretation', () => {
    const interpretations: Interpretation[] = [
      'normal', 'low', 'high', 'critical-low', 'critical-high',
    ]
    for (const interp of interpretations) {
      const { container } = render(<ResultColorIndicator interpretation={interp} />)
      const svg = container.querySelector('svg[aria-hidden="true"]')
      expect(svg, `Expected SVG for ${interp}`).not.toBeNull()
    }
  })
})

describe('ResultColorIndicator — className forwarding', () => {
  it('appends the className prop to the outer wrapper', () => {
    const { container } = render(
      <ResultColorIndicator interpretation="normal" className="custom-class" />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('custom-class')
  })
})
