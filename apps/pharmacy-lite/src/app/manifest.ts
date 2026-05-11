import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pharmacy Lite — Prescription Fulfillment',
    short_name: 'PharmacyLite',
    description: 'Ultranos Pharmacy Lite PWA for medication dispensing and prescription fulfillment',
    start_url: '/',
    display: 'standalone',
    theme_color: '#4f46e5',
    background_color: '#fafafa',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
