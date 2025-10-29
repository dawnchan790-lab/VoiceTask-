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
        // 最適化設定
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true, // 本番環境ではコンソールログを削除
            drop_debugger: true
          }
        },
        // チャンクサイズ警告の閾値を上げる（Firebase SDKは大きいため）
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          input: './src/client-entry.tsx',
          output: {
            entryFileNames: 'client.js',
            // 大きな依存関係を分割
            manualChunks: {
              'firebase': [
                'firebase/app',
                'firebase/auth',
                'firebase/firestore',
                'firebase/messaging'
              ],
              'vendor': ['react', 'react-dom']
            }
          }
        }
      }
    }
  }
  
  return {
    plugins: [pages()],
    build: {
      outDir: 'dist',
      minify: 'terser'
    }
  }
})
