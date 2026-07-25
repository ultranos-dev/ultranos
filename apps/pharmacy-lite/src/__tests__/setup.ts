import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Global next-intl mock: unit tests render client components without a
// NextIntlClientProvider. Returns the translation key (with interpolated params
// appended) so assertions can target keys. A test that needs real strings or
// different behavior overrides this with its own local vi.mock('next-intl').
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useLocale: () => 'en',
  useFormatter: () => ({
    dateTime: (d: Date) => String(d),
    number: (n: number) => String(n),
    relativeTime: (d: Date) => String(d),
  }),
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}))

// Dummy Supabase env so the client initializes at import time in tests.
// Tests never make real network calls (fake-indexeddb + mocks) — these need not be valid.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// Polyfill ResizeObserver for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Polyfill Element.scrollIntoView for jsdom
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function () {}
}

afterEach(async () => {
  cleanup()
})
