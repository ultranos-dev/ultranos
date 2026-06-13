import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import prs from './locales/prs'
import ps from './locales/ps'
import ar from './locales/ar'
import type { Lang } from '@/store/lang-store'

export function initI18n(lang: Lang): void {
  if (i18n.isInitialized) {
    void i18n.changeLanguage(lang)
    return
  }
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      prs: { translation: prs },
      ps: { translation: ps },
      ar: { translation: ar },
    },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
}

export { i18n }
