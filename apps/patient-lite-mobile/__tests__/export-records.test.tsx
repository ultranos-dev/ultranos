/**
 * Tests for FHIR R4 Bundle export UI and integration — Story 18.8
 *
 * AC #1: Export button on Profile screen
 * AC #5: Share sheet via expo-sharing
 * AC #6: Audit event with counts
 * AC #7: Loading indicator with progress
 * AC #8: Filename ultranos-health-record-{date}.json
 * AC #9: Temp file cleaned up after sharing
 */
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { ProfileScreen } from '@/screens/ProfileScreen'
import * as usePatientProfileModule from '@/hooks/usePatientProfile'
import * as encryptedDbModule from '@/lib/encrypted-db'
import * as auditModule from '@/lib/audit'
import type { FhirPatient } from '@ultranos/shared-types'
import { AdministrativeGender } from '@ultranos/shared-types'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock QR component
jest.mock('@/components/PatientQRCode', () => ({
  PatientQRCode: ({ patientId }: { patientId: string }) => {
    const { View, Text } = require('react-native')
    return (
      <View testID="patient-qr-code">
        <Text>{patientId}</Text>
      </View>
    )
  },
}))

jest.mock('@/hooks/usePatientProfile')
jest.mock('@/lib/encrypted-db')
jest.mock('@/lib/audit')

const mockUsePatientProfile = jest.spyOn(usePatientProfileModule, 'usePatientProfile')
const mockGetEncryptedDbConnection = jest.mocked(encryptedDbModule.getEncryptedDbConnection)
const mockEmitAuditEvent = jest.mocked(auditModule.emitAuditEvent)

const MOCK_PATIENT: FhirPatient = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  resourceType: 'Patient',
  name: [{ given: ['Fatima'], family: 'Al-Rashid', text: 'Fatima Al-Rashid' }],
  gender: AdministrativeGender.FEMALE,
  birthDate: '1990-03-15',
  birthYearOnly: false,
  identifier: [{ system: 'UAE_NATIONAL_ID', value: '784-1990-1234567-8' }],
  _ultranos: {
    nameLocal: 'فاطمة الرشيد',
    nameLatin: 'Fatima Al-Rashid',
    nationalIdHash: 'abc123hash',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  meta: { lastUpdated: '2026-04-28T10:00:00Z' },
}

const MOCK_PATIENT_DATA = JSON.stringify(MOCK_PATIENT)

function createMockDb() {
  return {
    getFirstAsync: jest.fn().mockResolvedValue({
      id: 'patient-001',
      data: MOCK_PATIENT_DATA,
      updated_at: '2026-04-28T10:00:00Z',
    }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    closeAsync: jest.fn(),
  } as any
}

function setupProfileScreen() {
  mockUsePatientProfile.mockReturnValue({
    patient: MOCK_PATIENT,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    updateProfile: jest.fn(),
    clearProfile: jest.fn(),
  })
}

describe('Export Records UI', () => {
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(() => {
    jest.clearAllMocks()
    mockDb = createMockDb()
    mockGetEncryptedDbConnection.mockResolvedValue(mockDb)
    ;(Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true)
    ;(Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined)
    ;(FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined)
    ;(FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined)
  })

  it('shows Export My Records button on profile screen (AC #1)', () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)
    expect(getByTestId('export-records-button')).toBeTruthy()
  })

  it('export button has correct accessibility label', () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)
    const button = getByTestId('export-records-button')
    expect(button.props.accessibilityLabel).toBe('passport.exportButton')
    expect(button.props.accessibilityRole).toBe('button')
  })

  it('shows loading state during export (AC #7)', async () => {
    setupProfileScreen()
    // Make shareAsync hang to keep loading state visible
    ;(Sharing.shareAsync as jest.Mock).mockImplementation(
      () => new Promise(() => {}), // Never resolves
    )

    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      // Give time for the async state updates
      await new Promise((r) => setTimeout(r, 50))
    })

    // Button should be disabled while exporting
    expect(getByTestId('export-records-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    )
  })

  it('invokes share sheet with correct filename (AC #5, #8)', async () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(Sharing.shareAsync).toHaveBeenCalled()
    })

    const shareCall = (Sharing.shareAsync as jest.Mock).mock.calls[0]
    const filePath = shareCall[0] as string

    // Should match pattern: cache dir + ultranos-health-record-YYYY-MM-DD.json
    expect(filePath).toMatch(/\/mock\/cache\/ultranos-health-record-\d{4}-\d{2}-\d{2}\.json/)
  })

  it('writes valid JSON to temp file before sharing', async () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalled()
    })

    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0]
    const content = writeCall[1] as string

    // Verify it's valid JSON with Bundle structure
    const parsed = JSON.parse(content)
    expect(parsed.resourceType).toBe('Bundle')
    expect(parsed.type).toBe('collection')
    expect(parsed.entry).toBeInstanceOf(Array)
  })

  it('cleans up temp file after sharing (AC #9)', async () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(FileSystem.deleteAsync).toHaveBeenCalled()
    })

    const deleteCall = (FileSystem.deleteAsync as jest.Mock).mock.calls[0]
    expect(deleteCall[0]).toMatch(/ultranos-health-record/)
    expect(deleteCall[1]).toEqual({ idempotent: true })
  })

  it('emits PATIENT_DATA_EXPORT audit event with correct counts (AC #6)', async () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PATIENT_DATA_EXPORT',
          resourceType: 'Bundle',
          resourceId: 'fhir-export',
          patientId: MOCK_PATIENT.id,
          outcome: 'success',
          metadata: expect.objectContaining({
            resourceCount: expect.any(String),
            resourceTypes: expect.any(String),
          }),
        }),
      )
    })
  })

  it('audit event contains no PHI — only counts and types (AC #6)', async () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(mockEmitAuditEvent).toHaveBeenCalled()
    })

    const auditCall = mockEmitAuditEvent.mock.calls.find(
      (call) => call[0].action === 'PATIENT_DATA_EXPORT',
    )
    expect(auditCall).toBeDefined()

    const event = auditCall![0]
    const metadataStr = JSON.stringify(event.metadata)

    // Ensure no PHI leaks in audit
    expect(metadataStr).not.toContain('Fatima')
    expect(metadataStr).not.toContain('Al-Rashid')
    expect(metadataStr).not.toContain('784-1990')
    expect(metadataStr).not.toContain('1990-03-15')
  })

  it('bundle includes meta tags (AC #10)', async () => {
    setupProfileScreen()
    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalled()
    })

    const writeCall = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0]
    const bundle = JSON.parse(writeCall[1] as string)

    expect(bundle.meta).toBeDefined()
    expect(bundle.meta.lastUpdated).toBeDefined()
    expect(bundle.meta.tag).toEqual([
      { system: 'ultranos', code: 'patient-export' },
    ])
  })

  it('does not show export button when profile is loading', () => {
    mockUsePatientProfile.mockReturnValue({
      patient: null,
      isLoading: true,
      error: null,
      refresh: jest.fn(),
      updateProfile: jest.fn(),
      clearProfile: jest.fn(),
    })

    const { queryByTestId } = render(<ProfileScreen />)
    // Loading state shows loading indicator, not the profile content
    expect(queryByTestId('export-records-button')).toBeNull()
  })

  it('emits failure audit event when export throws', async () => {
    setupProfileScreen()
    // Make DB query throw to trigger the failure path
    mockDb.getFirstAsync.mockRejectedValue(new Error('DB error'))

    const { getByTestId } = render(<ProfileScreen />)

    await act(async () => {
      fireEvent.press(getByTestId('export-records-button'))
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(mockEmitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PATIENT_DATA_EXPORT',
          outcome: 'failure',
          patientId: MOCK_PATIENT.id,
        }),
      )
    })
  })
})
