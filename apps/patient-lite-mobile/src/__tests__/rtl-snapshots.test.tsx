/**
 * Patient Lite Mobile RTL snapshot tests.
 *
 * Uses React Native Testing Library to render key components in both
 * LTR and RTL modes. Captures JSON tree snapshots that validate
 * layout direction, style application, and icon mirroring behavior.
 *
 * Components covered:
 * - PatientHealthCard (health cards — allergy, medication, consent)
 * - VisualLanguageGateway (language selector onboarding)
 */
import { render } from '@testing-library/react-native'
import { I18nManager } from 'react-native'
import { PatientHealthCard } from '../components/PatientHealthCard'
import { VisualLanguageGateway } from '../components/VisualLanguageGateway'
import { forceRTL, resetToLTR } from './rtl-helpers'

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock expo modules
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}))

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }),
    },
  },
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}))

describe('Patient Lite Mobile — RTL Snapshots', () => {
  afterEach(() => {
    resetToLTR()
  })

  describe('PatientHealthCard', () => {
    const variants = ['allergy', 'medication', 'consent'] as const

    for (const variant of variants) {
      it(`${variant} card renders correctly in LTR`, () => {
        forceRTL(false)
        const tree = render(
          <PatientHealthCard
            variant={variant}
            title={`${variant} title`}
            subtitle={`${variant} subtitle`}
            onPress={jest.fn()}
          />,
        )
        expect(tree.toJSON()).toMatchSnapshot()
      })

      it(`${variant} card renders correctly in RTL`, () => {
        forceRTL(true)
        const tree = render(
          <PatientHealthCard
            variant={variant}
            title={`${variant} title`}
            subtitle={`${variant} subtitle`}
            onPress={jest.fn()}
          />,
        )
        expect(tree.toJSON()).toMatchSnapshot()
      })
    }
  })

  describe('VisualLanguageGateway', () => {
    it('renders correctly in LTR', () => {
      forceRTL(false)
      const tree = render(
        <VisualLanguageGateway onLanguageSelected={jest.fn()} />,
      )
      expect(tree.toJSON()).toMatchSnapshot()
    })

    it('renders correctly in RTL', () => {
      forceRTL(true)
      const tree = render(
        <VisualLanguageGateway onLanguageSelected={jest.fn()} />,
      )
      expect(tree.toJSON()).toMatchSnapshot()
    })
  })
})
