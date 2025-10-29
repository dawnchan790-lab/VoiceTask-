import pages from '@hono/vite-cloudflare-pages'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    pages(),
    react()
  ],
  build: {
    rollupOptions: {
      input: {
        client: './src/client-entry.tsx'
      },
      output: {
        entryFileNames: 'static/[name].js'
      }
    }
  }
})
