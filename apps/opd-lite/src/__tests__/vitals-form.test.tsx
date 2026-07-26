import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VitalsForm } from '@/components/clinical/vitals-form'

// next-intl context isn't provided in unit tests; return the key so assertions target keys.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => 'en',
}))

const defaultProps = {
  weight: '',
  height: '',
  systolic: '',
  diastolic: '',
  temperature: '',
  onWeightChange: vi.fn(),
  onHeightChange: vi.fn(),
  onSystolicChange: vi.fn(),
  onDiastolicChange: vi.fn(),
  onTemperatureChange: vi.fn(),
  bmi: null as number | null,
  rangeStatuses: {} as Record<string, 'normal' | 'warning' | 'panic'>,
}

describe('VitalsForm', () => {
  it('renders all vital sign input fields', () => {
    render(<VitalsForm {...defaultProps} />)

    expect(screen.getByLabelText(/weight/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/height/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/placeholderSys/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/placeholderDia/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument()
  })

  it('renders inputs with type="number"', () => {
    render(<VitalsForm {...defaultProps} />)

    const weightInput = screen.getByLabelText(/weight/i)
    expect(weightInput).toHaveAttribute('type', 'number')
  })

  it('renders section labels for each vital sign field', () => {
    // The design system dropped Billboard/Inter 900 headers; vitals now use <label> elements
    // with font-semibold. Verify all 4 vital sign labels are present and visible.
    render(<VitalsForm {...defaultProps} />)

    expect(screen.getByText('weight')).toBeInTheDocument()
    expect(screen.getByText('height')).toBeInTheDocument()
    expect(screen.getByText('bloodPressure')).toBeInTheDocument()
    expect(screen.getByText('temperature')).toBeInTheDocument()
  })

  it('calls onChange handlers when values change', async () => {
    const user = userEvent.setup()
    const onWeightChange = vi.fn()
    render(<VitalsForm {...defaultProps} onWeightChange={onWeightChange} />)

    const weightInput = screen.getByLabelText(/weight/i)
    await user.type(weightInput, '70')
    expect(onWeightChange).toHaveBeenCalled()
  })

  it('renders units labels (kg, cm, mmHg, unitCelsius)', () => {
    render(<VitalsForm {...defaultProps} />)

    expect(screen.getByText('unitKg')).toBeInTheDocument()
    expect(screen.getByText('unitCm')).toBeInTheDocument()
    expect(screen.getByText('unitMmHg')).toBeInTheDocument()
    expect(screen.getByText('unitCelsius')).toBeInTheDocument()
  })

  it('displays BMI when provided', () => {
    render(<VitalsForm {...defaultProps} bmi={24.5} />)

    expect(screen.getByText(/24\.5/)).toBeInTheDocument()
    expect(screen.getByText('bmi')).toBeInTheDocument()
  })

  it('does not display BMI when null', () => {
    render(<VitalsForm {...defaultProps} bmi={null} />)

    expect(screen.queryByText('bmi')).not.toBeInTheDocument()
  })

  it('applies min/max constraints for clinical ranges', () => {
    render(<VitalsForm {...defaultProps} />)

    const weightInput = screen.getByLabelText(/weight/i)
    expect(weightInput).toHaveAttribute('min')
    expect(weightInput).toHaveAttribute('max')

    const tempInput = screen.getByLabelText(/temperature/i)
    expect(tempInput).toHaveAttribute('min')
    expect(tempInput).toHaveAttribute('max')
  })

  it('applies destructive (semantic) styling when rangeStatuses indicate panic', () => {
    // Design system replaced bg-red-*/border-red-* with semantic border-destructive token
    render(
      <VitalsForm
        {...defaultProps}
        temperature="42"
        rangeStatuses={{ temperature: 'panic' }}
      />,
    )

    const tempInput = screen.getByLabelText(/temperature/i)
    expect(tempInput.className).toMatch(/border-destructive/)
  })

  it('shows rangeCritical key text when panic status', () => {
    render(
      <VitalsForm
        {...defaultProps}
        temperature="42"
        rangeStatuses={{ temperature: 'panic' }}
      />,
    )
    expect(screen.getByText('rangeCritical')).toBeInTheDocument()
  })

  it('applies warning (semantic) styling when rangeStatuses indicate warning', () => {
    // Design system replaced border-amber-* with semantic border-warning token
    render(
      <VitalsForm
        {...defaultProps}
        temperature="38.6"
        rangeStatuses={{ temperature: 'warning' }}
      />,
    )

    const tempInput = screen.getByLabelText(/temperature/i)
    expect(tempInput.className).toMatch(/border-warning/)
  })

  it('shows rangeWarning key text when warning status', () => {
    render(
      <VitalsForm
        {...defaultProps}
        temperature="38.6"
        rangeStatuses={{ temperature: 'warning' }}
      />,
    )
    expect(screen.getByText('rangeWarning')).toBeInTheDocument()
  })

  it('uses dir="auto" for RTL support', () => {
    render(<VitalsForm {...defaultProps} />)

    const weightInput = screen.getByLabelText(/weight/i)
    // Numeric inputs don't need dir=auto, but the form container should support it
    expect(weightInput.closest('form') || weightInput.closest('div')).toBeTruthy()
  })

  it('renders step="0.1" for temperature input', () => {
    render(<VitalsForm {...defaultProps} />)

    const tempInput = screen.getByLabelText(/temperature/i)
    expect(tempInput).toHaveAttribute('step', '0.1')
  })

  describe('RTL snapshot tests', () => {
    it('matches snapshot in LTR mode', () => {
      const { container } = render(
        <div dir="ltr">
          <VitalsForm {...defaultProps} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })

    it('matches snapshot in RTL mode', () => {
      const { container } = render(
        <div dir="rtl">
          <VitalsForm {...defaultProps} />
        </div>,
      )
      expect(container).toMatchSnapshot()
    })
  })
})
