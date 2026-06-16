import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, ScreenHeader } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('ScreenHeader', () => {
  it('renders title and subtitle', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><ScreenHeader title="Saved" subtitle="12 medicines" /></UiKitProvider>,
    )
    expect(getByText('Saved')).toBeTruthy()
    expect(getByText('12 medicines')).toBeTruthy()
  })

  it('exposes the title as an accessibility header', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><ScreenHeader title="Profile" /></UiKitProvider>,
    )
    expect(getByRole('header')).toBeTruthy()
  })

  it('renders the action slot', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light"><ScreenHeader title="Home" action={<Text testID="act">A</Text>} /></UiKitProvider>,
    )
    expect(getByTestId('act')).toBeTruthy()
  })

  it('uses the Arabic font for the title in RTL', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light" rtl><ScreenHeader title="حفظ" /></UiKitProvider>,
    )
    expect(flattenStyle(getByRole('header').props.style).fontFamily).toBe('NotoNaskhArabic')
  })
})
