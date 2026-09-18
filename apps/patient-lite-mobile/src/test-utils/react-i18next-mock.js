// Shared react-i18next test mock: resolves keys against the real English catalog
// so render assertions can match user-facing text, and exposes an `i18n` object
// (useAppLocale reads i18n.language). Apply per-suite:
//   jest.mock('react-i18next', () => require('<rel>/test-utils/react-i18next-mock'))
// Deliberately NOT a global/auto mock — some suites assert raw i18n keys.
const messages = require('../../messages/en.json')

function lookup(key) {
  const parts = String(key).split('.')
  let value = messages
  for (const part of parts) {
    value = value && typeof value === 'object' ? value[part] : undefined
    if (value === undefined) break
  }
  return value
}

function makeT(namespace) {
  return (key, params) => {
    // Try `namespace.key` first (useTranslation('ns')), then the bare/full key.
    let value = namespace ? lookup(`${namespace}.${key}`) : undefined
    if (typeof value !== 'string') value = lookup(key)
    if (typeof value !== 'string') {
      // i18next allows t(key, 'default string') as well as t(key, { defaultValue }).
      if (typeof params === 'string') return params
      if (params && typeof params === 'object' && 'defaultValue' in params) {
        return String(params.defaultValue)
      }
      return key
    }
    if (params && typeof params === 'object') {
      let text = value
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v))
      }
      return text
    }
    return value
  }
}

const i18n = {
  language: 'en',
  changeLanguage: () => Promise.resolve(),
  on: () => {},
  off: () => {},
}

module.exports = {
  useTranslation: (namespace) => ({ t: makeT(namespace), i18n, ready: true }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
  I18nextProvider: ({ children }) => children,
}
