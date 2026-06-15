import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('expo-updates', () => ({
  reloadAsync: vi.fn(),
}))
vi.mock('lucide-react-native', () => ({
  AlertTriangle: 'AlertTriangle',
}))

import { ErrorBoundary } from '@/components/ErrorBoundary'

function BrokenComponent(): React.ReactElement {
  throw new Error('Test crash')
}

function WorkingComponent(): React.ReactElement {
  return <Text>Working</Text>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Working')).toBeTruthy()
  })

  it('renders CrashFallback when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByText('common.somethingWentWrong')).toBeTruthy()

    spy.mockRestore()
  })
})
