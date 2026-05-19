import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock trpc client
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getModuleSettings: {
        query: vi.fn().mockResolvedValue({
          consultationLanguages: ['en'],
          defaultSoapTemplate: 'standard',
          aiAssistedNotes: false,
        }),
      },
      updateModuleSettings: { mutate: vi.fn() },
    },
  },
  reportAdminAuthEvent: vi.fn(),
}))

const { ModuleSettingsCard } = await import('../components/settings/ModuleSettingsCard')

describe('ModuleSettingsCard', () => {
  it('renders OPD Lite settings card with SOAP template dropdown', async () => {
    render(<ModuleSettingsCard moduleCode="OPD_LITE" moduleName="OPD Lite" />)

    await waitFor(() => {
      expect(screen.getByText('OPD Lite')).toBeTruthy()
    })

    expect(screen.getByText('Default SOAP Template')).toBeTruthy()
    expect(screen.getByText('Consultation Languages')).toBeTruthy()
    expect(screen.getByText('AI-Assisted Notes')).toBeTruthy()
    expect(screen.getByText('Save OPD Lite Settings')).toBeTruthy()

    // Verify SOAP dropdown options exist
    const select = screen.getByDisplayValue('Standard')
    expect(select).toBeTruthy()
  })

  it('renders empty state for unknown module', () => {
    render(<ModuleSettingsCard moduleCode="UNKNOWN" moduleName="Unknown Module" />)
    expect(screen.getByText('No configurable settings for this module.')).toBeTruthy()
  })

  it('renders Pharmacy Lite toggle controls', async () => {
    render(<ModuleSettingsCard moduleCode="PHARMACY_LITE" moduleName="Pharmacy Lite" />)

    await waitFor(() => {
      expect(screen.getByText('Pharmacy Lite')).toBeTruthy()
    })

    expect(screen.getByText('Require Signature on Dispense')).toBeTruthy()
    expect(screen.getByText('Allow Partial Dispense')).toBeTruthy()
    expect(screen.getByText('Controlled Substance Double Verify')).toBeTruthy()
  })
})
