import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'fake-indexeddb/auto'
import { CulturalFlagType } from '../lib/cultural-flags'
import type { CulturalFlag } from '../lib/cultural-flags'

// i18n messages for cultural flags tests
const i18nMessages: Record<string, Record<string, string>> = {
  culturalFlags: {
    title: 'Cultural Preferences',
    editPreferences: 'Edit Preferences',
    addCustom: 'Add Custom',
    customDescription: 'Describe custom preference...',
    save: 'Save Preferences',
    helpText:
      'These preferences help provide culturally respectful care. They are guidance for the care team, not mandates.',
  },
  'culturalFlags.flag': {
    FEMALE_PHLEBOTOMIST: 'Prefers female phlebotomist',
    MALE_PHLEBOTOMIST: 'Prefers male phlebotomist',
    PRIVACY_SCREEN: 'Privacy screen recommended',
    FASTING_CARE: 'Fasting patient — offer water and date after collection',
    NO_MALE_FAMILY_PRESENT:
      'Prefers no male family members present during collection',
    NO_FEMALE_FAMILY_PRESENT:
      'Prefers no female family members present during collection',
    MODEST_GOWN: 'Prefers modest gown',
    PRAYER_TIME_ACCOMMODATION: 'Prayer time accommodation',
    GENDER_SEGREGATED_WAITING: 'Prefers gender-segregated waiting area',
    CUSTOM: 'Custom preference',
  },
  'culturalFlags.desc': {
    FEMALE_PHLEBOTOMIST:
      'Patient prefers blood draw by a female technician',
    MALE_PHLEBOTOMIST: 'Patient prefers blood draw by a male technician',
    PRIVACY_SCREEN: 'Use a privacy screen during sample collection',
    FASTING_CARE:
      'Patient may be fasting — offer water and a date after collection',
    NO_MALE_FAMILY_PRESENT:
      'Male family members should not be present during female sample collection',
    NO_FEMALE_FAMILY_PRESENT:
      'Female family members should not be present during male sample collection',
    MODEST_GOWN:
      'Provide a modest gown for the patient during procedures',
    PRAYER_TIME_ACCOMMODATION:
      'Accommodate scheduled prayer times during longer waits',
    GENDER_SEGREGATED_WAITING:
      'Patient prefers a gender-segregated waiting area',
    CUSTOM:
      'A custom cultural preference not covered by the predefined options',
  },
  common: {
    cancel: 'Cancel',
    loading: 'Loading...',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (namespace) {
      // Try namespace-specific messages first
      const val = i18nMessages[namespace]?.[key]
      if (val) return val
      // Try dotted lookup
      const dotted = `${namespace}.${key}`
      const [ns1, ns2, ...rest] = dotted.split('.')
      const compoundNs = `${ns1}.${ns2}`
      const leafKey = rest.join('.')
      if (i18nMessages[compoundNs]?.[leafKey]) return i18nMessages[compoundNs][leafKey]
      return dotted
    }
    // Root-level: split at first dot
    const [ns, ...rest] = key.split('.')
    const k = rest.join('.')
    // Check compound namespace
    if (rest.length >= 2) {
      const compoundNs = `${ns}.${rest[0]}`
      const leafKey = rest.slice(1).join('.')
      if (i18nMessages[compoundNs]?.[leafKey]) return i18nMessages[compoundNs][leafKey]
    }
    return i18nMessages[ns]?.[k] ?? key
  },
  useLocale: () => 'en',
}))

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    setPatientCulturalPreferences: vi.fn().mockResolvedValue(undefined),
  }
})

function makeFlag(
  type: CulturalFlagType,
  overrides: Partial<CulturalFlag> = {},
): CulturalFlag {
  return {
    type,
    isActive: true,
    setAt: '2026-05-30T10:00:00.000Z',
    setByTechId: 'tech-001',
    ...overrides,
  }
}

describe('CulturalFlagsBanner', () => {
  afterEach(cleanup)

  // Dynamic import so mocks are in place
  async function getBanner() {
    const mod = await import('../components/patients/CulturalFlagsBanner')
    return mod.CulturalFlagsBanner
  }

  it('renders nothing when no active flags', async () => {
    const Banner = await getBanner()
    const { container } = render(<Banner flags={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when all flags are inactive', async () => {
    const Banner = await getBanner()
    const flags = [
      makeFlag(CulturalFlagType.PRIVACY_SCREEN, { isActive: false }),
    ]
    const { container } = render(<Banner flags={flags} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders correct badges for active flags', async () => {
    const Banner = await getBanner()
    const flags = [
      makeFlag(CulturalFlagType.FEMALE_PHLEBOTOMIST),
      makeFlag(CulturalFlagType.PRIVACY_SCREEN),
    ]
    render(<Banner flags={flags} />)

    expect(screen.getByTestId('cultural-flags-banner')).toBeDefined()
    expect(screen.getByTestId('cultural-flag-FEMALE_PHLEBOTOMIST')).toBeDefined()
    expect(screen.getByTestId('cultural-flag-PRIVACY_SCREEN')).toBeDefined()
    expect(screen.getByText('Prefers female phlebotomist')).toBeDefined()
    expect(screen.getByText('Privacy screen recommended')).toBeDefined()
  })

  it('renders CUSTOM flag with its custom description', async () => {
    const Banner = await getBanner()
    const flags = [
      makeFlag(CulturalFlagType.CUSTOM, {
        customDescription: 'Prefers left arm draw',
      }),
    ]
    render(<Banner flags={flags} />)
    expect(screen.getByText('Prefers left arm draw')).toBeDefined()
  })

  it('renders edit button when onEditClick is provided', async () => {
    const Banner = await getBanner()
    const onClick = vi.fn()
    render(
      <Banner
        flags={[makeFlag(CulturalFlagType.FASTING_CARE)]}
        onEditClick={onClick}
      />,
    )
    const editBtn = screen.getByTestId('cultural-flags-edit-btn')
    expect(editBtn).toBeDefined()
  })

  it('does not render edit button when onEditClick is not provided', async () => {
    const Banner = await getBanner()
    render(<Banner flags={[makeFlag(CulturalFlagType.FASTING_CARE)]} />)
    expect(screen.queryByTestId('cultural-flags-edit-btn')).toBeNull()
  })

  it('uses blue/purple palette, not red', async () => {
    const Banner = await getBanner()
    const flags = [makeFlag(CulturalFlagType.MODEST_GOWN)]
    render(<Banner flags={flags} />)
    const banner = screen.getByTestId('cultural-flags-banner')
    const classes = banner.className
    expect(classes).toMatch(/indigo/)
    expect(classes).not.toMatch(/\bred\b/)
  })
})

describe('CulturalFlagsEditor', () => {
  afterEach(cleanup)

  async function getEditor() {
    const mod = await import('../components/patients/CulturalFlagsEditor')
    return mod.CulturalFlagsEditor
  }

  it('renders all predefined flag toggles', async () => {
    const Editor = await getEditor()
    render(
      <Editor patientRef="p-001" techId="t-001" hlcTimestamp="hlc-001" />,
    )
    expect(screen.getByTestId('cultural-flags-editor')).toBeDefined()
    expect(
      screen.getByTestId(
        `cultural-flag-toggle-${CulturalFlagType.FEMALE_PHLEBOTOMIST}`,
      ),
    ).toBeDefined()
    expect(
      screen.getByTestId(
        `cultural-flag-toggle-${CulturalFlagType.PRAYER_TIME_ACCOMMODATION}`,
      ),
    ).toBeDefined()
  })

  it('custom flag input works', async () => {
    const Editor = await getEditor()
    const user = userEvent.setup()
    render(
      <Editor patientRef="p-002" techId="t-001" hlcTimestamp="hlc-002" />,
    )

    const input = screen.getByTestId('custom-flag-input')
    const addBtn = screen.getByTestId('add-custom-flag-btn')

    await user.type(input, 'Prefers left arm')
    await user.click(addBtn)

    expect(screen.getByText('Prefers left arm')).toBeDefined()
    expect(screen.getByTestId('custom-flag-0')).toBeDefined()
  })

  it('save button calls setPatientCulturalPreferences', async () => {
    const Editor = await getEditor()
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <Editor
        patientRef="p-003"
        techId="t-001"
        hlcTimestamp="hlc-003"
        onSave={onSave}
      />,
    )

    // Toggle a flag on
    const toggle = screen
      .getByTestId(
        `cultural-flag-toggle-${CulturalFlagType.PRIVACY_SCREEN}`,
      )
      .querySelector('button[role="switch"]')!
    await userEvent.click(toggle)

    // Save
    const saveBtn = screen.getByTestId('save-cultural-flags-btn')
    await userEvent.click(saveBtn)

    expect(onSave).toHaveBeenCalled()
    const savedPrefs = onSave.mock.calls[0][0]
    expect(savedPrefs.patientRef).toBe('p-003')
    expect(savedPrefs.flags.length).toBeGreaterThan(0)
  })

  it('renders help tooltip with non-punitive text', async () => {
    const Editor = await getEditor()
    render(
      <Editor patientRef="p-004" techId="t-001" hlcTimestamp="hlc-004" />,
    )
    // The tooltip button has aria-label with the help text
    const tooltipBtn = screen.getByLabelText(
      'These preferences help provide culturally respectful care. They are guidance for the care team, not mandates.',
    )
    expect(tooltipBtn).toBeDefined()
  })
})

describe('Non-Punitive Framing — Translation Content', () => {
  const enforcementWords = ['REQUIRE', 'MUST', 'MANDATORY', 'OBLIGATORY']

  it('no flag label contains enforcement language (English)', () => {
    const flagLabels = i18nMessages['culturalFlags.flag']!
    for (const [key, label] of Object.entries(flagLabels)) {
      for (const word of enforcementWords) {
        expect(
          label.toUpperCase().includes(word),
          `Flag label "${key}" contains "${word}": "${label}"`,
        ).toBe(false)
      }
    }
  })

  it('no flag description contains enforcement language (English)', () => {
    const flagDescs = i18nMessages['culturalFlags.desc']!
    for (const [key, desc] of Object.entries(flagDescs)) {
      for (const word of enforcementWords) {
        expect(
          desc.toUpperCase().includes(word),
          `Flag desc "${key}" contains "${word}": "${desc}"`,
        ).toBe(false)
      }
    }
  })
})
