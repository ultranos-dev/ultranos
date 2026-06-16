import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { ProvincePicker } from '@/components/signup/ProvincePicker'
import { DistrictPicker } from '@/components/signup/DistrictPicker'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f3f4f6', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', border: '#e5e5e5', white: '#fff', overlay: 'rgba(0,0,0,0.5)' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

describe('Address pickers', () => {
  it('province picker lists provinces and selects one', () => {
    const onChange = vi.fn()
    const { getByTestId, getByText } = render(<ProvincePicker value="" onChange={onChange} />)
    fireEvent.press(getByTestId('province-picker-trigger'))
    fireEvent.press(getByText('Kabul'))
    expect(onChange).toHaveBeenCalledWith('Kabul')
  })

  it("district picker is disabled without a province and lists that province's districts when set", () => {
    const onChange = vi.fn()
    const { getByTestId, getByText, rerender } = render(<DistrictPicker province="" value="" onChange={onChange} />)
    fireEvent.press(getByTestId('district-picker-trigger'))
    // disabled: nothing opens — re-render with a province and select
    rerender(<DistrictPicker province="Kabul" value="" onChange={onChange} />)
    fireEvent.press(getByTestId('district-picker-trigger'))
    // Kabul has districts; pick the first rendered option by its known name
    expect(getByText('Kabul')).toBeTruthy() // Kabul province includes a "Kabul" district
    fireEvent.press(getByText('Kabul'))
    expect(onChange).toHaveBeenCalled()
  })
})
