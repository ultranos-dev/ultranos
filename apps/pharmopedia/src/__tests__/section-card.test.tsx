import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SectionCard } from '@/components/DrugDetail/SectionCard'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    surface: '#fff', surfaceSubtle: '#f5f5f5',
    dangerLight: '#fee2e2', dangerDark: '#991b1b',
    warningLight: '#fef3c7', warningDark: '#92400e',
    successLight: '#dcfce7', successDark: '#166534',
    danger: '#dc2626', warning: '#d97706',
    border: '#e5e5e5',
  }),
}))

describe('SectionCard', () => {
  it('renders title and text content', () => {
    render(<SectionCard title="Summary" text="Amoxicillin is an antibiotic." />)
    expect(screen.getByText('Summary')).toBeTruthy()
    expect(screen.getByText('Amoxicillin is an antibiotic.')).toBeTruthy()
  })

  it('renders bulleted list items', () => {
    render(<SectionCard title="Side Effects" items={['Nausea', 'Rash']} />)
    expect(screen.getByText(/Nausea/)).toBeTruthy()
    expect(screen.getByText(/Rash/)).toBeTruthy()
  })

  it('colors the title for danger severity (no box)', () => {
    render(<SectionCard title="Contraindications" items={['Penicillin allergy']} severity="danger" />)
    const title = screen.getByText('Contraindications')
    const style = title.props.style
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style
    expect(flat.color).toBe('#dc2626')
  })

  it('colors the title for warning severity (no box)', () => {
    render(<SectionCard title="Interactions" items={['Warfarin']} severity="warning" />)
    const title = screen.getByText('Interactions')
    const style = title.props.style
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style
    expect(flat.color).toBe('#d97706')
  })

  it('applies RTL text alignment', () => {
    render(<SectionCard title="Test" text="Content" isRtl />)
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('sets accessibilityRole header on title', () => {
    render(<SectionCard title="Dosing" text="500mg" />)
    const title = screen.getByText('Dosing')
    expect(title.props.accessibilityRole).toBe('header')
  })

  it('snapshot — danger severity (title + items)', () => {
    const { toJSON } = render(
      <SectionCard
        title="Contraindications"
        items={['Penicillin allergy', 'Severe renal impairment']}
        severity="danger"
        testID="snap-danger"
      />
    )
    expect(toJSON()).toMatchSnapshot()
  })

  it('snapshot — default severity (title + text)', () => {
    const { toJSON } = render(
      <SectionCard
        title="Mechanism of Action"
        text="Inhibits bacterial cell wall synthesis by binding to penicillin-binding proteins."
      />
    )
    expect(toJSON()).toMatchSnapshot()
  })
})
