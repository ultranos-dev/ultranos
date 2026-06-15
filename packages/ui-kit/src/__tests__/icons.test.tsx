import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  LayoutGrid,
  Users,
  Microscope,
  Bell,
  Calendar,
  Settings,
  ChevronRight,
  Pill,
  FlaskConical,
  Sun,
  AlertTriangle,
  Search,
} from '../icons'
import { DirectionalIcon } from '../components/DirectionalIcon'

describe('Icon catalog exports', () => {
  it('exports navigation icons as valid React components', () => {
    const icons = [LayoutGrid, ChevronRight, Search, Calendar, Settings]
    for (const Icon of icons) {
      expect(Icon).toBeDefined()
      expect(typeof Icon).toBe('object') // Lucide icons are forwardRef objects
    }
  })

  it('exports clinical icons as valid React components', () => {
    const icons = [Microscope, Pill, FlaskConical, Bell, AlertTriangle]
    for (const Icon of icons) {
      expect(Icon).toBeDefined()
    }
  })

  it('renders a Lucide icon with default props', () => {
    const { container } = render(<LayoutGrid />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })

  it('renders a Lucide icon with custom size', () => {
    const { container } = render(<Users size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('height')).toBe('20')
  })

  it('renders a Lucide icon with className for Tailwind styling', () => {
    const { container } = render(<Bell className="h-5 w-5 text-red-600" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('class')).toContain('h-5 w-5 text-red-600')
  })
})

describe('Lucide icons with DirectionalIcon wrapper', () => {
  it('wraps a navigation icon for RTL mirroring', () => {
    const { container } = render(
      <DirectionalIcon category="navigation">
        <ChevronRight size={20} />
      </DirectionalIcon>
    )
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    expect(span?.getAttribute('aria-hidden')).toBe('true')
    // Navigation icons get the transform CSS variable
    expect(span?.style.transform).toBe('var(--directional-icon-transform, none)')
    // SVG renders inside
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('wraps a medical icon without mirroring', () => {
    const { container } = render(
      <DirectionalIcon category="medical">
        <Pill size={20} />
      </DirectionalIcon>
    )
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    // Medical icons should NOT have the transform
    expect(span?.style.transform).toBeFalsy()
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders a lab icon at sidebar size (20px)', () => {
    const { container } = render(
      <DirectionalIcon category="medical">
        <Microscope size={20} />
      </DirectionalIcon>
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
  })

  it('renders Sun icon for pharmacy dosage timing', () => {
    const { container } = render(<Sun size={16} className="text-amber-500" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('class')).toContain('text-amber-500')
  })
})
