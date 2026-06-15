import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => {
  const messages: Record<string, Record<string, string>> = {
    confidence: {
      'principle.title': 'About AI Confidence Alerts',
      'principle.body': 'This system is designed to alert more aggressively when less certain.',
    },
  }
  return {
    useTranslations: (namespace?: string) => (key: string) =>
      namespace ? (messages[namespace]?.[key] ?? key) : key,
    useLocale: () => 'en',
  }
})

import { ConfidencePrincipleInfo } from '../components/ai/ConfidencePrincipleInfo'

describe('ConfidencePrincipleInfo — tooltip variant (default)', () => {
  it('renders the info button', () => {
    const { container } = render(<ConfidencePrincipleInfo />)
    const btn = container.querySelector('button[aria-label="About AI Confidence Alerts"]')
    expect(btn).toBeTruthy()
  })

  it('tooltip is closed by default', () => {
    render(<ConfidencePrincipleInfo />)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens tooltip on button click', () => {
    render(<ConfidencePrincipleInfo />)
    const btn = screen.getByRole('button', { name: 'About AI Confidence Alerts' })
    fireEvent.click(btn)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    expect(screen.getByText('This system is designed to alert more aggressively when less certain.')).toBeTruthy()
  })

  it('closes tooltip when backdrop is clicked', () => {
    render(<ConfidencePrincipleInfo />)
    const btn = screen.getByRole('button', { name: 'About AI Confidence Alerts' })
    fireEvent.click(btn)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    // Click the backdrop (first tabIndex=-1 button)
    const backdrop = document.querySelector('button[tabindex="-1"]') as HTMLButtonElement
    fireEvent.click(backdrop)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('ConfidencePrincipleInfo — panel variant', () => {
  it('renders the panel with title and body', () => {
    render(<ConfidencePrincipleInfo variant="panel" />)
    expect(screen.getByText('About AI Confidence Alerts')).toBeTruthy()
    expect(screen.getByText('This system is designed to alert more aggressively when less certain.')).toBeTruthy()
  })

  it('does not render an interactive button in panel variant', () => {
    render(<ConfidencePrincipleInfo variant="panel" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
