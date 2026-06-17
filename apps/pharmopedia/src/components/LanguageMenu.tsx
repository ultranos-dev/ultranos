import { useRef, useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, Dimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Globe, Check } from 'lucide-react-native'
import { useLangStore, type Lang } from '@/store/lang-store'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { hapticSelection } from '@/lib/haptics'

const OPTIONS: { value: Lang; label: string; short: string }[] = [
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'prs', label: 'دری', short: 'دری' },
  { value: 'ps', label: 'پښتو', short: 'پښتو' },
  { value: 'ar', label: 'عربي', short: 'عربي' },
]

type Anchor = { top: number; left?: number; right?: number }

const FALLBACK_ANCHOR: Anchor = { top: Spacing[16], right: Spacing[4] }

/**
 * Globe-icon button (with the active language code beside it) that opens a
 * dropdown menu of the four supported languages. Selecting a language is applied
 * immediately via the lang store (which calls i18next.changeLanguage), so
 * translated text updates in place.
 *
 * The menu is positioned by measuring the trigger's on-screen rect and anchoring
 * to the side it sits on — never by guessing from text direction — so it always
 * opens directly under the globe and does not jump sides when the language (and
 * therefore the layout direction) changes.
 */
export function LanguageMenu() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor>(FALLBACK_ANCHOR)
  const triggerRef = useRef<View>(null)

  const current = OPTIONS.find((o) => o.value === lang) ?? OPTIONS[0]

  function openMenu() {
    const node = triggerRef.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void
    } | null
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        const screenW = Dimensions.get('window').width
        const top = y + height + Spacing[1]
        if (x + width / 2 > screenW / 2) {
          setAnchor({ top, right: Math.max(Spacing[2], screenW - (x + width)) })
        } else {
          setAnchor({ top, left: Math.max(Spacing[2], x) })
        }
        setOpen(true)
      })
    } else {
      setAnchor(FALLBACK_ANCHOR)
      setOpen(true)
    }
  }

  function handleSelect(value: Lang) {
    setOpen(false)
    void hapticSelection()
    void setLang(value)
  }

  return (
    <>
      <Pressable
        ref={triggerRef}
        testID="lang-menu-trigger"
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={t('common.selectLanguage')}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        style={[styles.trigger, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
      >
        <Globe size={16} color={colors.textSecondary} />
        <Text style={[styles.triggerLabel, { color: colors.textSecondary }, current.value !== 'en' && styles.arabic]}>{current.short}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          testID="lang-menu-backdrop"
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel={t('common.cancel')}
        >
          <View
            style={[
              styles.menu,
              { top: anchor.top, left: anchor.left, right: anchor.right },
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityRole="menu"
          >
            {OPTIONS.map((opt) => {
              const active = lang === opt.value
              return (
                <Pressable
                  key={opt.value}
                  testID={`lang-menu-item-${opt.value}`}
                  onPress={() => handleSelect(opt.value)}
                  accessibilityRole="menuitem"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && { backgroundColor: colors.surfaceSubtle },
                  ]}
                >
                  <Text
                    style={[
                      styles.itemText,
                      { color: active ? colors.primary500 : colors.textPrimary },
                      active && { fontFamily: FontFamily.sansSemibold },
                      opt.value !== 'en' && styles.arabic,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {active ? <Check size={16} color={colors.primary500} /> : null}
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    height: 36,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  triggerLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansSemibold,
  },
  backdrop: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    minWidth: 160,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing[1],
    // Subtle elevation for the floating menu.
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  itemText: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansMedium,
  },
  arabic: {
    fontFamily: FontFamily.arabic,
  },
})
