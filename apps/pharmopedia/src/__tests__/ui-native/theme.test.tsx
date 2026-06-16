import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, useThemeColors, useRtl } from '@ultranos/ui-kit/native'

function Probe() {
  const colors = useThemeColors()
  const rtl = useRtl()
  return <Text testID="probe">{`${colors.textPrimary}|${rtl}`}</Text>
}

describe('UiKitProvider / useThemeColors / useRtl', () => {
  it('defaults to light + LTR with no provider', () => {
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('probe').props.children).toBe('#141c28|false')
  })

  it('resolves dark colors when mode="dark"', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="dark"><Probe /></UiKitProvider>,
    )
    expect(getByTestId('probe').props.children).toBe('#f0f0f0|false')
  })

  it('exposes rtl=true when rtl is set', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light" rtl><Probe /></UiKitProvider>,
    )
    expect(getByTestId('probe').props.children).toBe('#141c28|true')
  })
})
