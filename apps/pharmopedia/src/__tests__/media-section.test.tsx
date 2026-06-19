import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import type { DrugImage } from '@ultranos/shared-types'
import { MediaSection } from '@/components/DrugDetail/MediaSection'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surface: '#fff', surfaceSubtle: '#f5f5f5', textPrimary: '#111', textMuted: '#999' }),
}))
// expo-image renders a native <Image>; stub to a host element for the node test env
vi.mock('expo-image', () => {
  const React = require('react')
  return { Image: (props: Record<string, unknown>) => React.createElement('ExpoImage', props) }
})

const images: DrugImage[] = [
  { url: 'https://x/advil.jpg', brand: 'Advil', isPrimary: true },
  { url: 'https://x/generic.jpg' },
]

describe('MediaSection', () => {
  it('renders a tile per image with brand labels and a disclaimer', () => {
    render(<MediaSection images={images} />)
    expect(screen.getByTestId('media-tile-0')).toBeTruthy()
    expect(screen.getByTestId('media-tile-1')).toBeTruthy()
    expect(screen.getByText('Advil')).toBeTruthy()
    expect(screen.getByText('drug.photos.generic')).toBeTruthy()
    expect(screen.getByTestId('media-disclaimer')).toBeTruthy()
  })

  it('renders nothing when there are no images', () => {
    render(<MediaSection images={[]} />)
    expect(screen.queryByTestId('media-disclaimer')).toBeNull()
  })

  it('uses caption as the image accessibility label when present', () => {
    render(<MediaSection images={[{ url: 'https://x/a.jpg', caption: 'Front of box' }]} />)
    expect(screen.getByLabelText('Front of box')).toBeTruthy()
  })
})
