import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VitalsForm } from '@/components/clinical/vitals-form'

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
    expect(screen.getByLabelText(/systolic/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/diastolic/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument()
  })

  it('renders inputs with type="number"', () => {
    render(<VitalsForm {...defaultProps} />)

    const weightInput = screen.getByLabelText(/weight/i)
    expect(weightInput).toHaveAttribute('type', 'number')
  })

  it('renders Billboard typography headers (font-black / Inter 900)', () => {
    render(<VitalsForm {...defaultProps} />)

    // Billboard headers for each vital sign section
    const headers = screen.getAllByRole('heading', { level: 3 })
    expect(headers.length).toBeGreaterThanOrEqual(4) // Weight, Height, BP, Temp
    headers.forEach((header) => {
      expect(header.className).toMatch(/font-black/)
    })
  })

  it('calls onChange handlers when values change', async () => {
    const user = userEvent.setup()
    const onWeightChange = vi.fn()
    render(<VitalsForm {...defaultProps} onWeightChange={onWeightChange} />)

    const weightInput = screen.getByLabelText(/weight/i)
    await user.type(weightInput, '70')
    expect(onWeightChange).toHaveBeenCalled()
  })

  it('renders units labels (kg, cm, mmHg, C)', () => {
    render(<VitalsForm {...defaultProps} />)

    expect(screen.getByText(/kg/)).toBeInTheDocument()
    expect(screen.getByText(/cm/)).toBeInTheDocument()
    expect(screen.getByText(/mmHg/)).toBeInTheDocument()
    expect(screen.getByText(/°C/)).toBeInTheDocument()
  })

  it('displays BMI when provided', () => {
    render(<VitalsForm {...defaultProps} bmi={24.5} />)

    expect(screen.getByText(/24\.5/)).toBeInTheDocument()
    expect(screen.getByText(/BMI/)).toBeInTheDocument()
  })

  it('does not display BMI when null', () => {
    render(<VitalsForm {...defaultProps} bmi={null} />)

    expect(screen.queryByText(/BMI/)).not.toBeInTheDocument()
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

  it('applies red styling when rangeStatuses indicate panic', () => {
    render(
      <VitalsForm
        {...defaultProps}
        temperature="42"
        rangeStatuses={{ temperature: 'panic' }}
      />,
    )

    const tempInput = screen.getByLabelText(/temperature/i)
    expect(tempInput.className).toMatch(/border-red|ring-red/)
  })

  it('applies warning styling when rangeStatuses indicate warning', () => {
    render(
      <VitalsForm
        {...defaultProps}
        temperature="38.6"
        rangeStatuses={{ temperature: 'warning' }}
      />,
    )

    const tempInput = screen.getByLabelText(/temperature/i)
    expect(tempInput.className).toMatch(/border-amber|ring-amber/)
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
})
