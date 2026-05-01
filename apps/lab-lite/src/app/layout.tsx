import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '900'],
})

export const metadata: Metadata = {
  title: 'Lab Diagnostics Portal — Ultranos',
  description: 'Ultranos Lab Lite PWA for diagnostic result upload',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="auto" className={inter.variable}>
      <body className="font-sans bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b border-neutral-200 bg-white px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-primary-700">Lab Diagnostics Portal</h1>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
