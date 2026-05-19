import { render, act, waitFor } from '@testing-library/react-native'
import { Text, Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}))

import { ThemeProvider, useTheme, type ThemeMode } from '@/theme/ThemeProvider'
import { lightColors, darkColors, SAFETY_COLORS, QR_COLORS } from '@/theme/colors'

const mockGetItem = jest.mocked(AsyncStorage.getItem)
const mockSetItem = jest.mocked(AsyncStorage.setItem)

function ThemeConsumer() {
  const { mode, theme, colors, setMode } = useTheme()
  return (
    <>
      <Text testID="mode">{mode}</Text>
      <Text testID="theme">{theme}</Text>
      <Text testID="surface">{colors.surface}</Text>
      <Text testID="text-primary">{colors.textPrimary}</Text>
    </>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetItem.mockResolvedValue(null)
  mockSetItem.mockResolvedValue(undefined)
})

describe('ThemeProvider', () => {
  it('defaults to system mode when no stored preference', async () => {
    const { getByTestId } = render(
      <ThemeProvider initialMode="system">
        <ThemeConsumer />
      </ThemeProvider>,
    )

    expect(getByTestId('mode').props.children).toBe('system')
  })

  it('resolves to light theme when mode is light', () => {
    const { getByTestId } = render(
      <ThemeProvider initialMode="light">
        <ThemeConsumer />
      </ThemeProvider>,
    )

    expect(getByTestId('theme').props.children).toBe('light')
    expect(getByTestId('surface').props.children).toBe(lightColors.surface)
    expect(getByTestId('text-primary').props.children).toBe(lightColors.textPrimary)
  })

  it('resolves to dark theme when mode is dark', () => {
    const { getByTestId } = render(
      <ThemeProvider initialMode="dark">
        <ThemeConsumer />
      </ThemeProvider>,
    )

    expect(getByTestId('theme').props.children).toBe('dark')
    expect(getByTestId('surface').props.children).toBe(darkColors.surface)
    expect(getByTestId('text-primary').props.children).toBe(darkColors.textPrimary)
  })

  it('persists mode change to AsyncStorage', async () => {
    let setModeFn: (mode: ThemeMode) => void

    function SetModeCapture() {
      const { setMode } = useTheme()
      setModeFn = setMode
      return null
    }

    render(
      <ThemeProvider initialMode="light">
        <SetModeCapture />
      </ThemeProvider>,
    )

    act(() => {
      setModeFn!('dark')
    })

    expect(mockSetItem).toHaveBeenCalledWith('@ultranos/theme-mode', 'dark')
  })

  it('switches theme immediately without restart (AC #7)', () => {
    let setModeFn: (mode: ThemeMode) => void

    function SetModeCapture() {
      const { setMode, theme, colors } = useTheme()
      setModeFn = setMode
      return (
        <>
          <Text testID="theme">{theme}</Text>
          <Text testID="surface">{colors.surface}</Text>
        </>
      )
    }

    const { getByTestId } = render(
      <ThemeProvider initialMode="light">
        <SetModeCapture />
      </ThemeProvider>,
    )

    expect(getByTestId('theme').props.children).toBe('light')

    act(() => {
      setModeFn!('dark')
    })

    expect(getByTestId('theme').props.children).toBe('dark')
    expect(getByTestId('surface').props.children).toBe(darkColors.surface)
  })

  it('falls back to light theme when used outside ThemeProvider', () => {
    const { getByTestId } = render(<ThemeConsumer />)

    // Should default to light theme without throwing
    expect(getByTestId('mode').props.children).toBe('light')
    expect(getByTestId('theme').props.children).toBe('light')
    expect(getByTestId('surface').props.children).toBe(lightColors.surface)
  })
})

describe('Color palette definitions', () => {
  it('light and dark colors have identical shape', () => {
    const lightKeys = Object.keys(lightColors).sort()
    const darkKeys = Object.keys(darkColors).sort()
    expect(lightKeys).toEqual(darkKeys)
  })

  it('dark surface is not pure black (MD3 guideline)', () => {
    expect(darkColors.surface).not.toBe('#000000')
    expect(darkColors.surfaceElevated).not.toBe('#000000')
  })
})

describe('Safety colors (AC #9)', () => {
  it('allergy safety colors are defined for both themes', () => {
    expect(SAFETY_COLORS.allergyBgLight).toBeDefined()
    expect(SAFETY_COLORS.allergyBorderLight).toBeDefined()
    expect(SAFETY_COLORS.allergyIconLight).toBeDefined()
    expect(SAFETY_COLORS.allergyBgDark).toBeDefined()
    expect(SAFETY_COLORS.allergyBorderDark).toBeDefined()
    expect(SAFETY_COLORS.allergyIconDark).toBeDefined()
  })

  it('escalation colors are defined for both themes', () => {
    expect(SAFETY_COLORS.escalation).toBeDefined()
    expect(SAFETY_COLORS.escalationDark).toBeDefined()
  })
})

describe('QR colors (AC #10)', () => {
  it('QR code is always black on white', () => {
    expect(QR_COLORS.foreground).toBe('#000000')
    expect(QR_COLORS.background).toBe('#FFFFFF')
  })
})
