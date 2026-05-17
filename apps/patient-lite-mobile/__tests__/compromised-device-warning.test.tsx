/**
 * Tests for CompromisedDeviceWarning component.
 *
 * Story 21.5 AC#2: Warning displayed on compromised devices,
 * clinical features disabled, read-only access to existing data.
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CompromisedDeviceWarning } from '@/components/CompromisedDeviceWarning'
import { useDeviceSecurityStore } from '@/stores/device-security-store'

describe('CompromisedDeviceWarning', () => {
  beforeEach(() => {
    useDeviceSecurityStore.setState({
      checked: true,
      isCompromised: true,
      reasons: ['rooted'],
      checkedAt: '2026-05-12T00:00:00.000Z',
    })
  })

  it('renders warning title and message', () => {
    const { getByText } = render(<CompromisedDeviceWarning />)

    expect(getByText('Device Security Warning')).toBeTruthy()
    expect(
      getByText(/This device has been identified as compromised/),
    ).toBeTruthy()
  })

  it('displays formatted detection reasons', () => {
    useDeviceSecurityStore.setState({ reasons: ['rooted', 'debug-mode'] })

    const { getByText } = render(<CompromisedDeviceWarning />)

    expect(getByText('• Device is rooted or jailbroken')).toBeTruthy()
    expect(getByText('• Debug mode is active')).toBeTruthy()
  })

  it('shows read-only data button', () => {
    const { getByText } = render(<CompromisedDeviceWarning />)

    expect(getByText('View Existing Data (Read-Only)')).toBeTruthy()
  })

  it('switches to read-only mode when button is pressed', () => {
    const { getByText } = render(<CompromisedDeviceWarning />)

    fireEvent.press(getByText('View Existing Data (Read-Only)'))

    expect(getByText('Read-Only Mode — Device Compromised')).toBeTruthy()
    expect(
      getByText(/Clinical write operations are disabled/),
    ).toBeTruthy()
  })

  it('allows returning to warning from read-only mode', () => {
    const { getByText } = render(<CompromisedDeviceWarning />)

    // Enter read-only mode
    fireEvent.press(getByText('View Existing Data (Read-Only)'))
    expect(getByText('Back to Warning')).toBeTruthy()

    // Return to warning
    fireEvent.press(getByText('Back to Warning'))
    expect(getByText('Device Security Warning')).toBeTruthy()
  })

  it('displays detection-unavailable reason correctly', () => {
    useDeviceSecurityStore.setState({ reasons: ['detection-unavailable'] })

    const { getByText } = render(<CompromisedDeviceWarning />)

    expect(getByText('• Security check could not complete')).toBeTruthy()
  })
})
