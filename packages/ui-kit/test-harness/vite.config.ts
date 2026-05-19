import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  resolve: {
    alias: {
      '@ultranos/ui-kit': resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 3010,
    strictPort: true,
  },
})
