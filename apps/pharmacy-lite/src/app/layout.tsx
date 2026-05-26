import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { getLocale } from 'next-intl/server'
import { getDirection } from '@ultranos/ui-kit'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import './globals.css'

const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-latin-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/inter-latin-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/inter-latin-600.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/inter-latin-700.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/inter-latin-900.woff2', weight: '900', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Pharmacy Lite — Prescription Fulfillment',
  description: 'Ultranos Pharmacy Lite PWA for medication dispensing',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html lang={locale} dir={dir} className={inter.variable}>
      <head>
        {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
      </head>
      <body className="font-sans bg-neutral-50 text-neutral-900 antialiased">
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
