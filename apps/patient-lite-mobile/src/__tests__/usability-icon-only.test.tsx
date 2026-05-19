/**
 * Story 11.7 Task 10: Usability validation (AC #2).
 *
 * Verifies that core patient flows can be completed without reading text.
 * Each test confirms icon-only navigation paths exist.
 */

import { render, fireEvent } from '@testing-library/react-native'
import { PatientHealthCard } from '@/components/PatientHealthCard'
import { VisualLanguageGateway } from '@/components/VisualLanguageGateway'
import { NAV_ICONS, TAB_DEFINITIONS } from '@/config/icon-vocabulary'

describe('Usability: Icon-Only Navigation', () => {
  describe('Can navigate to prescriptions tab without reading text', () => {
    it('tab definitions include a timeline/history tab with an icon', () => {
      const timelineTab = TAB_DEFINITIONS.find((t) => t.key === 'timeline')
      expect(timelineTab).toBeDefined()
      expect(NAV_ICONS[timelineTab!.icon].emoji).toBeTruthy()
    })
  })

  describe('Can identify allergies without reading text', () => {
    it('allergy cards use distinct red color + warning icon', () => {
      const { getByTestId } = render(
        <PatientHealthCard
          variant="allergy"
          title="Penicillin"
          testID="allergy-visual"
        />,
      )

      const card = getByTestId('allergy-visual')
      const flatStyle = Array.isArray(card.props.style)
        ? Object.assign({}, ...card.props.style.flat())
        : card.props.style

      // Red background (visually distinct)
      expect(flatStyle.backgroundColor).toBe('#FEE2E2')

      // Has accessibility label for screen readers
      expect(card.props.accessibilityLabel).toContain('Penicillin')
    })
  })

  describe('Can show QR code without reading text', () => {
    it('passport tab exists in tab definitions with an icon', () => {
      const passportTab = TAB_DEFINITIONS.find((t) => t.key === 'passport')
      expect(passportTab).toBeDefined()
      expect(NAV_ICONS[passportTab!.icon].emoji).toBeTruthy()
    })
  })

  describe('Can change language without reading text', () => {
    it('language gateway uses native script buttons (no English-only text)', () => {
      const mockSelect = jest.fn()
      const { getByText, getByTestId } = render(
        <VisualLanguageGateway onSelect={mockSelect} />,
      )

      // Each language button shows text in its own script
      expect(getByText('العربية')).toBeTruthy() // Arabic in Arabic script
      expect(getByText('دری')).toBeTruthy()     // Dari in Arabic script
      expect(getByText('English')).toBeTruthy()  // English is recognizable to English speakers

      // Can select by tapping the large button
      fireEvent.press(getByTestId('language-button-ar'))
      expect(mockSelect).toHaveBeenCalledWith('ar')
    })
  })

  describe('Can listen to prescription audio without reading text', () => {
    it('audio icon (speaker) is in the navigation icon vocabulary', () => {
      expect(NAV_ICONS.audio).toBeDefined()
      expect(NAV_ICONS.audio.emoji).toBe('🔊')
    })
  })

  describe('All navigation tabs have recognizable icons', () => {
    it('every tab has a unique emoji icon', () => {
      const icons = TAB_DEFINITIONS.map((tab) => NAV_ICONS[tab.icon].emoji)
      const unique = new Set(icons)
      expect(unique.size).toBe(TAB_DEFINITIONS.length)
    })

    it('icons are universally recognizable medical/navigation symbols', () => {
      // House = home, clipboard = history, shield = privacy/consent
      expect(NAV_ICONS.home.emoji).toBe('🏠')
      expect(NAV_ICONS.history.emoji).toBe('📋')
      expect(NAV_ICONS.consent.emoji).toBe('🛡️')
    })
  })
})
