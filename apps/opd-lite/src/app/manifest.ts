import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ultranos OPD Lite',
    short_name: 'OPD Lite',
    description: 'Offline-first clinical encounter management for outpatient departments',
    start_url: '/',
    display: 'standalone',
    theme_color: '#1e40af',
    background_color: '#f9fafb',
    icons: [
      // W3C manifest spec allows space-separated purposes; Next.js types are too narrow
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' as 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' as 'any' },
    ],
  }
}
