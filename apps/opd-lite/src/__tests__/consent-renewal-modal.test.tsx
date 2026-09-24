import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConsentRenewalModal } from '../components/patient/ConsentRenewalModal'

// Story 63.1: the modal is fully keyed. The global mock returns the key, so
// assertions target keys. This also verifies the ui-kit Dialog migration
// (role="dialog", built-in close, Escape) behaves identically.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/hub-url', () => ({
  getHubTrpcUrl: () => 'http://hub/trpc',
}))

describe('ConsentRenewalModal (Story 63.1 — keyed + ui-kit Dialog)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders as a radix dialog with the keyed title and default fields', () => {
    render(<ConsentRenewalModal patientId="p-1" onClose={vi.fn()} onRenewed={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Keyed title
    expect(screen.getByText('renewTitle')).toBeInTheDocument()
    // Method + Language + Version labels present (keys)
    expect(screen.getByText('methodLabel')).toBeInTheDocument()
    expect(screen.getByText('languageLabel')).toBeInTheDocument()
    expect(screen.getByText('versionLabel')).toBeInTheDocument()
    // Witness field is hidden until VERBAL_WITNESSED is chosen (identical behavior)
    expect(screen.queryByText('witnessLabel')).not.toBeInTheDocument()
  })

  it('reveals the witness field when method is verbal', () => {
    render(<ConsentRenewalModal patientId="p-1" onClose={vi.fn()} onRenewed={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('methodLabel'), { target: { value: 'VERBAL_WITNESSED' } })
    expect(screen.getByText('witnessLabel')).toBeInTheDocument()
  })

  it('disables submit until a version is entered (validation preserved)', () => {
    render(<ConsentRenewalModal patientId="p-1" onClose={vi.fn()} onRenewed={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'renewConsent' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('versionLabel'), { target: { value: '2.0' } })
    expect(submit).toBeEnabled()
  })

  it('submits to consent.renew and calls onRenewed + onClose on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const onRenewed = vi.fn()
    const onClose = vi.fn()

    render(<ConsentRenewalModal patientId="p-42" onClose={onClose} onRenewed={onRenewed} />)
    fireEvent.change(screen.getByLabelText('versionLabel'), { target: { value: '2.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'renewConsent' }))

    await waitFor(() => expect(onRenewed).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://hub/trpc/consent.renew',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.json).toMatchObject({ patientId: 'p-42', method: 'WRITTEN', language: 'en', version: '2.0' })
  })

  it('shows a keyed error and does not close on Hub failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const onClose = vi.fn()
    render(<ConsentRenewalModal patientId="p-1" onClose={onClose} onRenewed={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('versionLabel'), { target: { value: '2.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'renewConsent' }))

    await waitFor(() => expect(screen.getByText('renewError')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel button fires onClose', () => {
    const onClose = vi.fn()
    render(<ConsentRenewalModal patientId="p-1" onClose={onClose} onRenewed={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
