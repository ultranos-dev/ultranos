import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { PickerField } from '@/components/signup/PickerField'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f3f4f6', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', border: '#e5e5e5', white: '#fff', overlay: 'rgba(0,0,0,0.5)' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

describe('PickerField', () => {
  it('shows the placeholder when no value, and the value when set', () => {
    const { getByTestId, rerender } = render(<PickerField testID="pf" label="Province" placeholder="Select" value="" options={['Kabul', 'Herat']} onSelect={() => {}} />)
    expect(getByTestId('pf-value').props.children).toBe('Select')
    rerender(<PickerField testID="pf" label="Province" placeholder="Select" value="Kabul" options={['Kabul', 'Herat']} onSelect={() => {}} />)
    expect(getByTestId('pf-value').props.children).toBe('Kabul')
  })

  it('opens the modal and selects an option', () => {
    const onSelect = vi.fn()
    const { getByTestId, getByText } = render(<PickerField testID="pf" label="Province" placeholder="Select" value="" options={['Kabul', 'Herat']} onSelect={onSelect} />)
    fireEvent.press(getByTestId('pf-trigger'))
    fireEvent.press(getByText('Herat'))
    expect(onSelect).toHaveBeenCalledWith('Herat')
  })

  it('does not open when disabled', () => {
    const { getByTestId, queryByText } = render(<PickerField testID="pf" label="District" placeholder="Select" value="" options={['A']} onSelect={() => {}} disabled />)
    fireEvent.press(getByTestId('pf-trigger'))
    expect(queryByText('A')).toBeNull()
  })
})
