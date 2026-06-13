import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { I18nManager } from 'react-native'
import * as Updates from 'expo-updates'

export type Lang = 'en' | 'prs' | 'ps' | 'ar'

const RTL_LANGS: ReadonlySet<Lang> = new Set(['prs', 'ps', 'ar'])
const LANG_KEY = '@pharmopedia/lang'

export function isRtlLang(lang: Lang): boolean {
  return RTL_LANGS.has(lang)
}

interface LangState {
  lang: Lang
  initialized: boolean
  init: () => Promise<void>
  setLang: (lang: Lang) => Promise<void>
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: 'en',
  initialized: false,

  async init() {
    const saved = await SecureStore.getItemAsync(LANG_KEY)
    const lang = (saved as Lang | null) ?? 'en'
    I18nManager.allowRTL(true)
    I18nManager.forceRTL(isRtlLang(lang))
    set({ lang, initialized: true })
  },

  async setLang(lang: Lang) {
    const prev = get().lang
    await SecureStore.setItemAsync(LANG_KEY, lang)
    set({ lang })
    if (isRtlLang(prev) !== isRtlLang(lang)) {
      I18nManager.forceRTL(isRtlLang(lang))
      try {
        await Updates.reloadAsync()
      } catch {
        // Expo Go dev mode: Updates.reloadAsync() is unavailable.
        // User must close and reopen the app manually.
      }
    }
  },
}))
