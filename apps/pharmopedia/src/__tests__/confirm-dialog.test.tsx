import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { ConfirmDialog, type ConfirmDialogProps } from '@ultranos/ui-kit/native'

function setup(overrides: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <ConfirmDialog
      visible
      title="Sign out?"
      message="You will need to sign in again."
      confirmLabel="Sign out"
      cancelLabel="Cancel"
      testID="dlg"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { ...utils, onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('renders nothing while hidden', () => {
    const { queryByTestId } = setup({ visible: false })
    expect(queryByTestId('dlg')).toBeNull()
  })

  it('renders title, message and both action labels when visible', () => {
    const { getByTestId, getByText } = setup()
    expect(getByTestId('dlg')).toBeTruthy()
    expect(getByText('Sign out?')).toBeTruthy()
    expect(getByText('You will need to sign in again.')).toBeTruthy()
    expect(getByTestId('dlg-confirm')).toBeTruthy()
    expect(getByTestId('dlg-cancel')).toBeTruthy()
  })

  it('omits the message row when no message is given', () => {
    const { queryByText } = setup({ message: undefined })
    expect(queryByText('You will need to sign in again.')).toBeNull()
  })

  it('calls onConfirm when the confirm button is pressed', () => {
    const { getByTestId, onConfirm, onCancel } = setup()
    fireEvent.press(getByTestId('dlg-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when the cancel button is pressed', () => {
    const { getByTestId, onCancel, onConfirm } = setup()
    fireEvent.press(getByTestId('dlg-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onCancel when the backdrop is pressed', () => {
    const { getByTestId, onCancel } = setup()
    fireEvent.press(getByTestId('dlg-backdrop'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('still confirms in the destructive variant', () => {
    const { getByTestId, onConfirm } = setup({ destructive: true })
    fireEvent.press(getByTestId('dlg-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
