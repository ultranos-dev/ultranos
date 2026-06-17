import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { CollapsibleSection } from '@ultranos/ui-kit/native'

const child = <Text>body content</Text>

describe('CollapsibleSection', () => {
  it('is closed by default — body not rendered', () => {
    render(<CollapsibleSection title="Side effects" testID="sec">{child}</CollapsibleSection>)
    expect(screen.queryByText('body content')).toBeNull()
  })

  it('opens on header press', () => {
    render(<CollapsibleSection title="Side effects" testID="sec">{child}</CollapsibleSection>)
    fireEvent.press(screen.getByTestId('sec'))
    expect(screen.getByText('body content')).toBeTruthy()
  })

  it('respects defaultOpen', () => {
    render(<CollapsibleSection title="What it is" defaultOpen testID="sec">{child}</CollapsibleSection>)
    expect(screen.getByText('body content')).toBeTruthy()
  })
})
