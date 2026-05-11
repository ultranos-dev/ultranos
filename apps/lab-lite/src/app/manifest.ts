import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lab Lite',
    short_name: 'LabLite',
    description: 'Ultranos Lab Lite — Diagnostic Results Upload',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#0d6a51',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }
}
