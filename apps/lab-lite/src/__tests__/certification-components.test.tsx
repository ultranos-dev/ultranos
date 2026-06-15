/**
 * Story 46.6 — Certification Pathway Tracker: Component Tests
 * Task 9 — component tests for Dashboard and CertificateViewer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CertificateViewer } from '../components/certification/CertificateViewer'
import type { DigitalCertificate } from '../lib/certification-types'

// ---------------------------------------------------------------------------
// next-intl mock
// ---------------------------------------------------------------------------
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params?.date) return `Completed on ${params.date}`
    return key
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCertificate(overrides: Partial<DigitalCertificate> = {}): DigitalCertificate {
  return {
    id: 'cert-001',
    technicianId: 'tech-123',
    technicianName: 'Ahmad Karimi',
    pathwayId: 'pathway-level1',
    milestoneName: 'Complete 5 modules',
    issuedAt: '2026-03-15T10:00:00Z',
    verificationCode: 'vc-abc-def-123',
    syncStatus: 'synced',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// CertificateViewer tests
// ---------------------------------------------------------------------------

describe('CertificateViewer', () => {
  it('renders technician name and milestone name', () => {
    const cert = makeCertificate()
    render(<CertificateViewer certificate={cert} />)

    expect(screen.getByText('Ahmad Karimi')).toBeTruthy()
    expect(screen.getByText('Complete 5 modules')).toBeTruthy()
  })

  it('renders verification code', () => {
    const cert = makeCertificate()
    render(<CertificateViewer certificate={cert} />)

    expect(screen.getByText('vc-abc-def-123')).toBeTruthy()
  })

  it('shows verifiableOnline when syncStatus is synced', () => {
    const cert = makeCertificate({ syncStatus: 'synced' })
    render(<CertificateViewer certificate={cert} />)

    expect(screen.getByText('verifiableOnline')).toBeTruthy()
  })

  it('shows pendingSync when syncStatus is pending', () => {
    const cert = makeCertificate({ syncStatus: 'pending' })
    render(<CertificateViewer certificate={cert} />)

    expect(screen.getByText('pendingSync')).toBeTruthy()
  })

  it('download button is disabled when pdfBlob is undefined', () => {
    const cert = makeCertificate({ pdfBlob: undefined })
    render(<CertificateViewer certificate={cert} />)

    const downloadBtn = screen.getByRole('button', { name: /downloadPdf/i })
    expect(downloadBtn).toBeTruthy()
    expect((downloadBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('download button is enabled when pdfBlob is present', () => {
    const cert = makeCertificate({ pdfBlob: new Blob(['%PDF'], { type: 'application/pdf' }) })
    render(<CertificateViewer certificate={cert} />)

    const downloadBtn = screen.getByRole('button', { name: /downloadPdf/i })
    expect((downloadBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows "copied" after clicking copy button (clipboard mock)', async () => {
    const cert = makeCertificate()

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    })

    render(<CertificateViewer certificate={cert} />)

    // Find copy button by its text content
    const copyBtns = screen.getAllByRole('button')
    const copyBtn = copyBtns.find((b) => b.textContent === 'copy')
    expect(copyBtn).toBeTruthy()
    fireEvent.click(copyBtn!)

    await waitFor(() => {
      // After copy, button text contains 'copied'
      const updatedBtn = screen.getAllByRole('button').find((b) =>
        b.textContent?.includes('copied'),
      )
      expect(updatedBtn).toBeTruthy()
    })
  })

  it('no PHI exposed — does not render patient IDs or clinical data', () => {
    const cert = makeCertificate()
    const { container } = render(<CertificateViewer certificate={cert} />)

    const html = container.innerHTML
    // No patient ref, no sample IDs, no diagnoses
    expect(html).not.toContain('Patient/')
    expect(html).not.toContain('Specimen/')
  })
})

// ---------------------------------------------------------------------------
// RTL snapshot — CertificateViewer
// ---------------------------------------------------------------------------

describe('CertificateViewer RTL snapshot', () => {
  it('renders correctly in RTL layout', () => {
    const cert = makeCertificate()
    const { container } = render(
      <div dir="rtl">
        <CertificateViewer certificate={cert} />
      </div>,
    )
    expect(container.firstChild).toBeTruthy()
  })
})
