import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'ar', 'prs', 'ps'],
  defaultLocale: 'en',
  localePrefix: 'never',
})
