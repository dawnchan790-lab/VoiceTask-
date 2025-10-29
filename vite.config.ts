import pages from '@hono/vite-cloudflare-pages'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  if (mode === 'client') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist/static',
        emptyOutDir: false,
        rollupOptions: {
          input: './src/client-entry.tsx',
          output: {
            entryFileNames: 'client.js'
          }
        }
      }
    }
  }
  
  return {
    plugins: [pages()],
    build: {
      outDir: 'dist'
    }
  }
})
