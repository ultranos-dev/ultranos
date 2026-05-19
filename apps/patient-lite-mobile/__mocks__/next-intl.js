// Mock for next-intl — imported transitively via @ultranos/ui-kit
module.exports = {
  useLocale: () => 'en',
  useTranslations: () => (key) => key,
  useMessages: () => ({}),
  useNow: () => new Date(),
  useTimeZone: () => 'UTC',
  useFormatter: () => ({}),
  NextIntlClientProvider: ({ children }) => children,
}
