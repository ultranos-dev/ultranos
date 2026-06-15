import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Share } from 'react-native'
import { ShareButton } from '@/components/DrugDetail/ShareButton'

// lucide-react-native icons are not available in vitest — stub them out
vi.mock('lucide-react-native', () => ({
  Share2: () => null,
}))

describe('ShareButton', () => {
  const shareSpy = vi.spyOn(Share, 'share')

  beforeEach(() => {
    shareSpy.mockClear()
    shareSpy.mockResolvedValue({ action: 'sharedAction', activityType: undefined })
  })

  it('renders a pressable with testID="share-button"', () => {
    render(<ShareButton atcCode="J01CA04" drugName="Amoxicillin" />)
    expect(screen.getByTestId('share-button')).toBeTruthy()
  })

  it('calls Share.share with the drug name and pharmopedia deep link on press', async () => {
    render(<ShareButton atcCode="J01CA04" drugName="Amoxicillin" />)
    await fireEvent.press(screen.getByTestId('share-button'))
    expect(shareSpy).toHaveBeenCalledOnce()
    const content = shareSpy.mock.calls[0][0] as { message: string }
    expect(content.message).toContain('Amoxicillin')
    expect(content.message).toContain('pharmopedia://drug/J01CA04')
  })

  it('encodes ATC codes with special characters safely', async () => {
    render(<ShareButton atcCode="N02AA01" drugName="Morphine" />)
    await fireEvent.press(screen.getByTestId('share-button'))
    const content = shareSpy.mock.calls[0][0] as { message: string }
    expect(content.message).toContain('pharmopedia://drug/N02AA01')
  })
})
