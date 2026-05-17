import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PediatricDosingBanner } from '@/components/clinical/PediatricDosingBanner'

function birthDateYearsAgo(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

describe('PediatricDosingBanner', () => {
  it('renders for patient aged 5', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(5)} />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).not.toBeNull()
  })

  it('renders for patient aged 17', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(17)} />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).not.toBeNull()
  })

  it('does NOT render for patient aged 18', () => {
    const today = new Date()
    const eighteenYearsAgo = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate(),
    )
    const birthDate = eighteenYearsAgo.toISOString().slice(0, 10)

    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDate} />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).toBeNull()
  })

  it('does NOT render for patient aged 45', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(45)} />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).toBeNull()
  })

  it('displays exact warning text', () => {
    render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(10)} />,
    )
    expect(
      screen.getByText('Weight-based dosing not supported — calculate manually'),
    ).toBeDefined()
  })

  it('has no close or dismiss button', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(10)} />,
    )
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(0)
    const closeElements = container.querySelectorAll(
      '[aria-label*="close" i], [aria-label*="dismiss" i], [data-dismiss]',
    )
    expect(closeElements.length).toBe(0)
  })

  it('has yellow warning background styling', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(10)} />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).not.toBeNull()
    expect((banner as HTMLElement).style.backgroundColor).toBe('rgb(255, 209, 26)')
  })

  it('boundary: patient born exactly 18 years ago today shows no banner', () => {
    const today = new Date()
    const eighteenYearsAgo = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate(),
    )
    const birthDate = eighteenYearsAgo.toISOString().slice(0, 10)

    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDate} />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).toBeNull()
  })

  it('renders correctly in RTL layout', () => {
    const { container } = render(
      <div dir="rtl">
        <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(10)} />
      </div>,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).not.toBeNull()
    expect(banner?.getAttribute('dir')).toBe('auto')
    expect(
      screen.getByText('Weight-based dosing not supported — calculate manually'),
    ).toBeDefined()
    expect(container).toMatchSnapshot()
  })

  it('does NOT render for invalid birth date', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate="not-a-date" />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).toBeNull()
  })

  it('does NOT render when birthYearOnly is true', () => {
    const { container } = render(
      <PediatricDosingBanner patientBirthDate={birthDateYearsAgo(10)} birthYearOnly />,
    )
    const banner = container.querySelector('[data-testid="pediatric-dosing-banner"]')
    expect(banner).toBeNull()
  })
})
