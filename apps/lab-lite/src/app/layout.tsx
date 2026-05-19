import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { getLocale } from 'next-intl/server'
import { getDirection } from '@ultranos/ui-kit'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import { InstallPrompt } from '@/components/InstallPrompt'
import './globals.css'

const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/inter-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/inter-600.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/inter-700.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/inter-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Lab Diagnostics Portal — Ultranos',
  description: 'Ultranos Lab Lite PWA for diagnostic result upload',
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
          <header className="border-b border-neutral-200 bg-white px-6 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-primary-700">Lab Diagnostics Portal</h1>
            </div>
          </header>
          <main className="mx-auto max-w-2xl px-4 py-6">
            {children}
          </main>
          <InstallPrompt />
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
