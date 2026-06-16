import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InspectionReadinessView } from '@/components/safety/InspectionReadinessView'
import { LabRole } from '@ultranos/shared-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`
    return key
  },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn(),
}))

vi.mock('@/lib/safety/inspection-readiness', () => ({
  generateInspectionPack: vi.fn(),
}))

import { useAuthSessionStore } from '@/stores/auth-session-store'
import { generateInspectionPack } from '@/lib/safety/inspection-readiness'

const mockManager = { labRole: LabRole.LAB_MANAGER }
const mockTechnician = { labRole: LabRole.LAB_TECHNICIAN }

const mockPack = {
  generatedAt: '2025-04-01T10:00:00.000Z',
  dateRange: { start: '2025-01-01', end: '2025-03-31' },
  auditResults: [
    {
      id: 'a1',
      auditDate: '2025-01-15',
      auditMonth: '2025-01',
      conductedBy: 'practitioner-123',
      complianceScore: 90,
      status: 'COMPLETED',
      completedAt: '2025-01-15T10:00:00.000Z',
      notes: '',
      hlcTimestamp: 'hlc-test',
      items: [],
    },
  ],
  wasteSummaries: [],
  temperatureCompliance: { totalReadings: 100, excursionCount: 3, excursionRate: 0.03 },
  spillIncidents: [],
  overallComplianceScore: 90,
  availableSections: ['auditResults', 'temperatureCompliance'],
  missingSections: ['wasteSummaries', 'spillIncidents'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InspectionReadinessView', () => {
  describe('access control', () => {
    it('shows access restricted message for non-manager', () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockTechnician)
      render(<InspectionReadinessView />)
      expect(screen.getByText('accessRestricted')).toBeInTheDocument()
    })

    it('renders form for manager', () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<InspectionReadinessView />)
      expect(screen.getByText('inspectionReadinessTitle')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'generatePack' })).toBeInTheDocument()
    })
  })

  describe('date inputs', () => {
    it('renders start and end date inputs', () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      render(<InspectionReadinessView />)
      expect(screen.getByLabelText('startDate')).toBeInTheDocument()
      expect(screen.getByLabelText('endDate')).toBeInTheDocument()
    })
  })

  describe('generate pack', () => {
    it('calls generateInspectionPack on button click', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue(mockPack)
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(generateInspectionPack).toHaveBeenCalled()
      })
    })

    it('displays overall compliance score after generation', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue(mockPack)
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByText('90.0%')).toBeInTheDocument()
      })
    })

    it('displays export JSON button after generation', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue(mockPack)
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'exportJson' })).toBeInTheDocument()
      })
    })

    it('shows error alert when generateInspectionPack rejects', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockRejectedValue(new Error('DB error'))
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText('DB error')).toBeInTheDocument()
      })
    })
  })

  describe('missing sections', () => {
    it('shows waste not available when wasteSummaries is missing', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue(mockPack)
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByText('wasteNotAvailable')).toBeInTheDocument()
      })
    })

    it('shows spill not available when spillIncidents is missing', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue(mockPack)
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByText('spillNotAvailable')).toBeInTheDocument()
      })
    })

    it('shows temperature stats when temperatureCompliance is available', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue(mockPack)
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        // totalReadings = 100, excursionCount = 3
        expect(screen.getByText('100')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
      })
    })
  })

  describe('audit scores section', () => {
    it('shows no audit data message when auditResults is empty', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue({
        ...mockPack,
        auditResults: [],
      })
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByText('noAuditData')).toBeInTheDocument()
      })
    })

    it('shows score incomplete for null complianceScore', async () => {
      vi.mocked(useAuthSessionStore).mockReturnValue(mockManager)
      vi.mocked(generateInspectionPack).mockResolvedValue({
        ...mockPack,
        auditResults: [{ ...mockPack.auditResults[0], complianceScore: null }],
      })
      render(<InspectionReadinessView />)

      fireEvent.click(screen.getByRole('button', { name: 'generatePack' }))

      await waitFor(() => {
        expect(screen.getByText('scoreIncomplete')).toBeInTheDocument()
      })
    })
  })
})
