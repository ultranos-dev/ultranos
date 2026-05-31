import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { getLocale } from 'next-intl/server'
import { getDirection } from '@ultranos/ui-kit'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import './globals.css'

const urbanist = localFont({
  src: '../../public/fonts/Urbanist-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-urbanist',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#1e40af',
}

export const metadata: Metadata = {
  title: 'OPD Lite — Patient Search',
  description: 'Ultranos OPD Lite PWA for clinical encounters',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OPD Lite',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html lang={locale} dir={dir} className={urbanist.variable}>
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
