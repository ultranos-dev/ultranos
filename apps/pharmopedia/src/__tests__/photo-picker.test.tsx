import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PhotoPicker } from '@/components/signup/PhotoPicker'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f3f4f6', textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', primary50: '#edfaf4', primary600: '#237d5a', border: '#e5e5e5', white: '#fff' }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

describe('PhotoPicker', () => {
  it('calls onChange with a uri after choosing from library', async () => {
    const onChange = vi.fn()
    const { getByTestId } = render(<PhotoPicker value={null} onChange={onChange} />)
    fireEvent.press(getByTestId('photo-choose'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('file:///mock/photo.jpg'))
  })

  it('shows a remove control when a photo is set and clears it', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(<PhotoPicker value="file:///mock/photo.jpg" onChange={onChange} />)
    fireEvent.press(getByTestId('photo-remove'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
