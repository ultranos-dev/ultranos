import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugImage } from '@ultranos/shared-types'
import { DrugThumbnail } from '@/components/DrugDetail/DrugThumbnail'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surfaceSubtle: '#f5f5f5', primary500: '#2e9e71' }),
}))
vi.mock('expo-image', () => {
  const React = require('react')
  return { Image: (props: Record<string, unknown>) => React.createElement('ExpoImage', props) }
})

describe('DrugThumbnail', () => {
  it('shows the primary image when present', () => {
    const images: DrugImage[] = [{ url: 'https://x/a.jpg' }, { url: 'https://x/primary.jpg', isPrimary: true }]
    render(<DrugThumbnail images={images} name="Ibuprofen" />)
    const img = screen.getByTestId('drug-thumb-image')
    expect(img.props.source).toBe('https://x/primary.jpg')
  })

  it('falls back to the pill icon when there are no images', () => {
    render(<DrugThumbnail images={[]} name="Ibuprofen" />)
    expect(screen.getByTestId('drug-thumb-fallback')).toBeTruthy()
    expect(screen.queryByTestId('drug-thumb-image')).toBeNull()
  })
})
