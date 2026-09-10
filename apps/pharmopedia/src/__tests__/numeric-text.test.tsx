/**
 * numeric-text.test.tsx
 *
 * NumericText renders numeric values in Google Space Mono on mobile.
 *
 * React Native has no per-glyph unicode-range fallback (the web digit-only
 * trick), so on mobile the whole value string is wrapped in <NumericText> and
 * rendered in Space Mono. These tests guard that the mono family is applied and
 * that the bold variant selects the 700-weight face.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { FontFamily } from '@ultranos/ui-kit/tokens.native'
import { NumericText } from '@ultranos/ui-kit/native'
import { flattenStyle } from './ui-native/_flatten'

describe('NumericText', () => {
  it('renders its value in the Space Mono numeric face', () => {
    const { queryByTestId } = render(
      <NumericText testID="val">1,240.50</NumericText>,
    )
    const node = queryByTestId('val')!
    expect(node).toBeTruthy()
    expect(node.props.children).toBe('1,240.50')
    expect(flattenStyle(node.props.style).fontFamily).toBe(FontFamily.mono)
  })

  it('uses the bold Space Mono face when bold', () => {
    const { queryByTestId } = render(
      <NumericText testID="val" bold>
        42
      </NumericText>,
    )
    expect(flattenStyle(queryByTestId('val')!.props.style).fontFamily).toBe(FontFamily.monoBold)
  })

  it('lets caller style override color/size while keeping the mono family', () => {
    const { queryByTestId } = render(
      <NumericText testID="val" style={{ color: '#ff0000', fontSize: 22 }}>
        7
      </NumericText>,
    )
    const style = flattenStyle(queryByTestId('val')!.props.style)
    expect(style.fontFamily).toBe(FontFamily.mono)
    expect(style.color).toBe('#ff0000')
    expect(style.fontSize).toBe(22)
  })

  it('maps mono tokens to the Space Mono families registered in useFonts', () => {
    expect(FontFamily.mono).toBe('SpaceMono')
    expect(FontFamily.monoBold).toBe('SpaceMono-Bold')
  })
})
