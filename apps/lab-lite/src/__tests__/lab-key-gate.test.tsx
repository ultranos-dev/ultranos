import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// Toggle the mocked key-readiness between assertions.
let ready = false
vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { isReady: () => ready },
}))

import { LabKeyGate } from '@/components/LabKeyGate'

describe('LabKeyGate (Story 58.3 — encryption-key readiness gate)', () => {
  beforeEach(() => { ready = false })

  it('shows the loading state and withholds children until the key is ready', () => {
    render(<LabKeyGate><div>secure-content</div></LabKeyGate>)
    expect(screen.queryByText('secure-content')).toBeNull()
    expect(screen.getByLabelText('Unlocking secure data')).toBeTruthy()
  })

  it('renders children once the key-ready event fires', async () => {
    render(<LabKeyGate><div>secure-content</div></LabKeyGate>)
    expect(screen.queryByText('secure-content')).toBeNull()
    ready = true
    await act(async () => {
      window.dispatchEvent(new Event('ultranos:lab-key-ready'))
    })
    await waitFor(() => expect(screen.getByText('secure-content')).toBeTruthy())
  })

  it('renders children immediately when the key is already ready at mount', () => {
    ready = true
    render(<LabKeyGate><div>secure-content</div></LabKeyGate>)
    expect(screen.getByText('secure-content')).toBeTruthy()
  })
})
