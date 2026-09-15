import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Bell } from '../icons'

const toastFn = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: Object.assign((...a: any[]) => toastFn(...a), { error: (...a: any[]) => toastError(...a) }),
}))

import { AppToaster, notify } from '../components/ui/app-toaster'

describe('AppToaster', () => {
  it('renders without crashing', () => {
    const { container } = render(<AppToaster />)
    expect(container).toBeTruthy()
  })
})

describe('notify', () => {
  beforeEach(() => {
    toastFn.mockClear()
    toastError.mockClear()
  })

  it('shows a toast with subject + app-name description', () => {
    notify({ icon: Bell, appName: 'Lab Lite', subject: 'Lab order received' })
    expect(toastFn).toHaveBeenCalledTimes(1)
    const [subject, opts] = toastFn.mock.calls[0]
    expect(subject).toBe('Lab order received')
    expect(opts.description).toBe('Lab Lite')
    expect(opts.action).toBeUndefined()
  })

  it('uses toast.error for urgent notifications', () => {
    notify({ icon: Bell, appName: 'Lab Lite', subject: 'Critical result', urgent: true })
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('renders an action with the caller-provided localized label only when onClick+actionLabel are given', () => {
    const onClick = vi.fn()
    notify({ icon: Bell, appName: 'Lab Lite', subject: 'X', onClick, actionLabel: 'View details' })
    const opts = toastFn.mock.calls[0][1]
    expect(opts.action.label).toBe('View details')
    opts.action.onClick()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('omits the action when onClick is given without a label', () => {
    notify({ icon: Bell, appName: 'Lab Lite', subject: 'X', onClick: vi.fn() })
    expect(toastFn.mock.calls[0][1].action).toBeUndefined()
  })
})
