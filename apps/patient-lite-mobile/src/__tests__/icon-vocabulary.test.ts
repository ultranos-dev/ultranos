import { NAV_ICONS, HEALTH_CARD_STYLES, TAB_DEFINITIONS } from '@/config/icon-vocabulary'

describe('Icon Vocabulary', () => {
  describe('NAV_ICONS', () => {
    it('provides all required navigation icons', () => {
      const requiredKeys = [
        'home', 'prescriptions', 'allergies', 'history',
        'consent', 'notifications', 'qrIdentity', 'settings', 'language', 'audio',
      ]
      for (const key of requiredKeys) {
        expect(NAV_ICONS[key as keyof typeof NAV_ICONS]).toBeDefined()
      }
    })

    it('each icon has emoji and labelKey', () => {
      for (const [, entry] of Object.entries(NAV_ICONS)) {
        expect(entry.emoji).toBeTruthy()
        expect(entry.labelKey).toBeTruthy()
      }
    })

    it('emojis are culturally neutral (no hand gestures)', () => {
      const gestureEmojis = ['👍', '👎', '🤞', '✌️', '🖕', '🤙', '👌', '🤟']
      for (const [, entry] of Object.entries(NAV_ICONS)) {
        expect(gestureEmojis).not.toContain(entry.emoji)
      }
    })
  })

  describe('HEALTH_CARD_STYLES', () => {
    it('provides allergy, medication, and consent variants', () => {
      expect(HEALTH_CARD_STYLES.allergy).toBeDefined()
      expect(HEALTH_CARD_STYLES.medication).toBeDefined()
      expect(HEALTH_CARD_STYLES.consent).toBeDefined()
    })

    it('allergy uses red background (#FEE2E2)', () => {
      expect(HEALTH_CARD_STYLES.allergy.backgroundColor).toBe('#FEE2E2')
    })

    it('medication uses blue background (#DBEAFE)', () => {
      expect(HEALTH_CARD_STYLES.medication.backgroundColor).toBe('#DBEAFE')
    })

    it('consent uses green background (#D1FAE5)', () => {
      expect(HEALTH_CARD_STYLES.consent.backgroundColor).toBe('#D1FAE5')
    })

    it('each variant has distinct icon + color (not color-only differentiation)', () => {
      const emojis = new Set(Object.values(HEALTH_CARD_STYLES).map((s) => s.emoji))
      expect(emojis.size).toBe(3) // All icons are different
      const colors = new Set(Object.values(HEALTH_CARD_STYLES).map((s) => s.backgroundColor))
      expect(colors.size).toBe(3) // All colors are different
    })
  })

  describe('TAB_DEFINITIONS', () => {
    it('defines exactly 4 tabs', () => {
      expect(TAB_DEFINITIONS).toHaveLength(4)
    })

    it('tabs have keys: passport, timeline, privacy, notifications', () => {
      const keys = TAB_DEFINITIONS.map((t) => t.key)
      expect(keys).toEqual(['passport', 'timeline', 'privacy', 'notifications'])
    })

    it('each tab references a valid NAV_ICONS key', () => {
      for (const tab of TAB_DEFINITIONS) {
        expect(NAV_ICONS[tab.icon]).toBeDefined()
      }
    })
  })
})
