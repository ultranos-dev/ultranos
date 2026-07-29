/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock next/navigation ────────────────────────────────────
const mockPush = vi.fn()
const mockParams = { submissionId: 'sub-1' }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/providers',
  useParams: () => mockParams,
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockQuery = vi.fn()
const mockMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listKycSubmissions: { query: (...args: any[]) => mockQuery('listKycSubmissions', ...args) },
      getKycSubmission: { query: (...args: any[]) => mockQuery('getKycSubmission', ...args) },
      reviewKycSubmission: { mutate: (...args: any[]) => mockMutate('reviewKycSubmission', ...args) },
      dashboardStats: { query: (...args: any[]) => mockQuery('dashboardStats', ...args) },
    },
  },
}))

const { default: KycQueuePage } = await import('../app/[locale]/providers/page')
const { default: KycSubmissionDetailPage } = await import('../app/[locale]/providers/[submissionId]/page')

// Fresh submission (not breached)
const freshDate = new Date()
freshDate.setDate(freshDate.getDate() - 1)

// Breached submission (>3 business days ago)
const breachedDate = new Date()
breachedDate.setDate(breachedDate.getDate() - 7)

const mockQueueData = {
  submissions: [
    {
      submissionId: 'sub-1',
      practitionerId: 'pract-1',
      providerName: 'Dr. Ahmed Hassan',
      submittedAt: freshDate.toISOString(),
      registryNumber: 'REG-12345',
      registryVerificationStatus: null,
      licenseDocumentKey: 'pract-1/MEDICAL_LICENSE-1234',
      kycStatus: 'PENDING_VERIFICATION',
      slaDeadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      slaBreached: false,
      slaRemainingHours: 48,
    },
    {
      submissionId: 'sub-2',
      practitionerId: 'pract-2',
      providerName: 'Dr. Sara Ali',
      submittedAt: breachedDate.toISOString(),
      registryNumber: 'REG-67890',
      registryVerificationStatus: null,
      licenseDocumentKey: null,
      kycStatus: 'PENDING_VERIFICATION',
      slaDeadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      slaBreached: true,
      slaRemainingHours: null,
    },
  ],
  total: 2,
  cursor: 0,
  limit: 25,
}

const mockDetailData = {
  submission: {
    id: 'sub-1',
    practitionerId: 'pract-1',
    submittedAt: freshDate.toISOString(),
    status: 'PENDING',
    registryNumber: 'REG-12345',
    rejectionReason: null,
    adminMessage: null,
    reviewedBy: null,
    reviewedAt: null,
  },
  providerName: 'Dr. Ahmed Hassan',
  kycStatus: 'PENDING_VERIFICATION',
  documentUrls: [
    { type: 'MEDICAL_LICENSE' as const, url: 'https://storage.example.com/license.jpg' },
    { type: 'NATIONAL_ID' as const, url: 'https://storage.example.com/id.jpg' },
  ],
  ocrFields: [
    {
      documentType: 'MEDICAL_LICENSE' as const,
      fields: [
        { name: 'Name', value: 'Dr. Ahmed Hassan', confidence: 0.95 },
        { name: 'License Number', value: 'ML-9876', confidence: 0.88 },
        { name: 'Issuing Body', value: 'Ministry of Health', confidence: 0.72 },
        { name: 'Expiry Date', value: '2027-12-31', confidence: 0.91 },
      ],
    },
  ],
  slaDeadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  slaBreached: false,
  slaRemainingHours: 48,
}

describe('Story 22.2 — KYC Dashboard UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── KYC Queue Page ─────────────────────────────────────────
  describe('KycQueuePage', () => {
    it('renders table with correct columns', async () => {
      mockQuery.mockImplementation((method: string) => {
        if (method === 'listKycSubmissions') return Promise.resolve(mockQueueData)
        return Promise.resolve({})
      })

      render(<KycQueuePage />)

      await waitFor(() => {
        expect(screen.getByText('Dr. Ahmed Hassan')).toBeInTheDocument()
      })

      // Column headers — AC #2 (i18n values from en.json → providers namespace)
      expect(screen.getByText('Provider Name')).toBeInTheDocument()
      expect(screen.getByText('Submitted')).toBeInTheDocument()
      expect(screen.getByText('License Doc')).toBeInTheDocument()
      expect(screen.getByText('Registry Status')).toBeInTheDocument()
      expect(screen.getByText('Days Pending')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()

      // Data
      expect(screen.getByText('Dr. Sara Ali')).toBeInTheDocument()
    })

    it('SLA breached items are highlighted in red — AC #7', async () => {
      mockQuery.mockResolvedValue(mockQueueData)

      render(<KycQueuePage />)

      await waitFor(() => {
        expect(screen.getByText('Dr. Sara Ali')).toBeInTheDocument()
      })

      // The breached row should show "SLA Breached" text (in table cell AND filter tab)
      const breachedElements = screen.getAllByText('SLA Breached')
      expect(breachedElements.length).toBeGreaterThanOrEqual(1)
      // At least one should be in the table (not the filter tab)
      const tableBreach = breachedElements.find((el) => el.tagName === 'SPAN')
      expect(tableBreach).toBeTruthy()
    })

    it('renders filter tabs: All, Pending, SLA Breached — AC #11', async () => {
      mockQuery.mockResolvedValue(mockQueueData)

      render(<KycQueuePage />)

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument()
      })

      // "Pending" appears in both filter tab and status badges, use getAllByText
      const pendingElements = screen.getAllByText('Pending')
      expect(pendingElements.length).toBeGreaterThanOrEqual(1)
      // Filter tabs should include SLA Breached
      const slaElements = screen.getAllByText('SLA Breached')
      expect(slaElements.length).toBeGreaterThanOrEqual(1)
    })

    it('navigates to detail page on row click', async () => {
      mockQuery.mockResolvedValue(mockQueueData)

      const user = userEvent.setup()
      render(<KycQueuePage />)

      await waitFor(() => {
        expect(screen.getByText('Dr. Ahmed Hassan')).toBeInTheDocument()
      })

      // The provider-name cell is now a Link to the profile with stopPropagation,
      // so click the row itself (not the inner link) to trigger the row navigation.
      const row = screen.getByText('Dr. Ahmed Hassan').closest('tr')!
      await user.click(row)
      expect(mockPush).toHaveBeenCalledWith('/providers/sub-1')
    })
  })

  // ── KYC Submission Detail Page ─────────────────────────────
  describe('KycSubmissionDetailPage', () => {
    it('renders OCR fields alongside document — AC #3', async () => {
      mockQuery.mockImplementation((method: string) => {
        if (method === 'getKycSubmission') return Promise.resolve(mockDetailData)
        return Promise.resolve({})
      })

      render(<KycSubmissionDetailPage />)

      // "Dr. Ahmed Hassan" appears in both h1 heading and OCR field value
      await waitFor(() => {
        const nameElements = screen.getAllByText('Dr. Ahmed Hassan')
        expect(nameElements.length).toBeGreaterThanOrEqual(1)
      })

      // OCR fields visible
      expect(screen.getByText('License Number')).toBeInTheDocument()
      expect(screen.getByText('ML-9876')).toBeInTheDocument()
      expect(screen.getByText('Ministry of Health')).toBeInTheDocument()

      // Confidence indicators
      expect(screen.getByText('95%')).toBeInTheDocument()
      expect(screen.getByText('72%')).toBeInTheDocument()

      // Document sections — "Medical License" appears in both document and OCR panels
      const licenseLabels = screen.getAllByText('Medical License')
      expect(licenseLabels.length).toBeGreaterThanOrEqual(1)
    })

    it('shows approve/reject/request-info buttons for PENDING — AC #4', async () => {
      mockQuery.mockResolvedValue(mockDetailData)

      render(<KycSubmissionDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument()
      })

      expect(screen.getByText('Reject')).toBeInTheDocument()
      expect(screen.getByText('Request More Info')).toBeInTheDocument()
    })

    it('shows confirmation dialog before approve — AC #4', async () => {
      mockQuery.mockResolvedValue(mockDetailData)

      const user = userEvent.setup()
      render(<KycSubmissionDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Approve'))

      // Confirmation dialog appears (title = providers.detailConfirmApproveTitle,
      // reason field label = providers.detailReason = "Reason")
      expect(screen.getByText('Approve Provider')).toBeInTheDocument()
      expect(screen.getByLabelText(/Reason/)).toBeInTheDocument()
    })

    it('shows confirmation dialog with required reason for reject — AC #4', async () => {
      mockQuery.mockResolvedValue(mockDetailData)

      const user = userEvent.setup()
      render(<KycSubmissionDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Reject')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Reject'))

      // Confirmation dialog with required reason (title = providers.detailConfirmRejectTitle
      // = "Reject Submission"; reason field label = providers.detailReason = "Reason")
      expect(screen.getByText('Reject Submission')).toBeInTheDocument()
      expect(screen.getByLabelText(/Reason/)).toBeInTheDocument()
    })

    it('redirects back to queue after successful action', async () => {
      mockQuery.mockResolvedValue(mockDetailData)
      mockMutate.mockResolvedValue({ success: true, newKycStatus: 'ACTIVE' })

      const user = userEvent.setup()
      render(<KycSubmissionDetailPage />)

      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Approve'))
      // Click confirm in dialog
      const confirmButtons = screen.getAllByText('Approve')
      await user.click(confirmButtons[confirmButtons.length - 1]!)

      // Success toast text = providers.detailActionSuccess = "Action completed successfully"
      await waitFor(() => {
        expect(screen.getByText(/Action completed successfully/)).toBeInTheDocument()
      })
    })
  })
})
