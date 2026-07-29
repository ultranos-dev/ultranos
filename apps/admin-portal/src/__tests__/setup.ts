import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import enMessages from '../../messages/en.json'

// ── Global next-intl mock ────────────────────────────────────────────────
// Most page/component tests render components that call `useTranslations`
// without wrapping them in a NextIntlClientProvider. Rather than add a provider
// to every test, resolve real messages from en.json so assertions written
// against English UI text continue to work. A test may still override this with
// its own local `vi.mock('next-intl', ...)` (local mocks take precedence).
vi.mock('next-intl', () => {
  const resolve = (namespace: string | undefined, key: string): string => {
    const path = namespace ? `${namespace}.${key}` : key
    let node: unknown = enMessages
    for (const part of path.split('.')) {
      if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
        node = (node as Record<string, unknown>)[part]
      } else {
        return key // fall back to the key when the message is absent
      }
    }
    return typeof node === 'string' ? node : key
  }
  const interpolate = (template: string, values?: Record<string, unknown>): string =>
    values
      ? template.replace(/\{(\w+)\}/g, (_, name) => (name in values ? String(values[name]) : `{${name}}`))
      : template
  const useTranslations = (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => interpolate(resolve(namespace, key), values)
    t.rich = (key: string) => resolve(namespace, key)
    t.markup = (key: string) => resolve(namespace, key)
    t.raw = (key: string) => resolve(namespace, key)
    t.has = () => true
    return t
  }
  return {
    useTranslations,
    useLocale: () => 'en',
    useMessages: () => enMessages,
    useFormatter: () => ({
      dateTime: (d: Date) => String(d),
      number: (n: number) => String(n),
      relativeTime: (d: Date) => String(d),
    }),
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  }
})

// jsdom does not implement window.matchMedia; stub it for components that use
// media query hooks (e.g. SidebarProvider → useSidebar → use-mobile).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom does not implement <canvas> 2D context; stub it so chart/sparkline
// widgets (dashboard, audit trend) render without throwing.
if (typeof HTMLCanvasElement !== 'undefined') {
   
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillRect: () => {}, clearRect: () => {}, getImageData: () => ({ data: [] }),
    putImageData: () => {}, createImageData: () => [], setTransform: () => {},
    drawImage: () => {}, save: () => {}, restore: () => {}, beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, closePath: () => {}, stroke: () => {},
    translate: () => {}, scale: () => {}, rotate: () => {}, arc: () => {},
    fill: () => {}, measureText: () => ({ width: 0 }), fillText: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any
}

afterEach(() => {
  cleanup()
})
