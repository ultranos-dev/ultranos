import type { Metadata } from 'next'
import localFont from 'next/font/local'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="auto" className={inter.variable}>
      <body className="font-sans bg-neutral-50 text-neutral-900 antialiased">
        <ClientErrorBoundary>
          <header className="border-b border-neutral-200 bg-white px-6 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-primary-700">Pharmacy Lite</h1>
            </div>
          </header>
          <main className="mx-auto max-w-2xl px-4 py-6">
            {children}
          </main>
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
