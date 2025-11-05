import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { rmSync, copyFileSync, existsSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'move-index-html',
      closeBundle() {
        // Move index.html from dist/public to dist root
        const srcPath = resolve(__dirname, 'dist/public/index.html')
        const destPath = resolve(__dirname, 'dist/index.html')
        
        try {
          if (existsSync(srcPath)) {
            copyFileSync(srcPath, destPath)
            // Remove the public directory
            rmSync(resolve(__dirname, 'dist/public'), { recursive: true, force: true })
          }
        } catch (e) {
          console.error('Failed to move index.html:', e)
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 最適化設定
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // デバッグのためコンソールログを残す
        drop_debugger: true
      }
    },
    // チャンクサイズ警告の閾値を上げる（Firebase SDKは大きいため）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html')
      },
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
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  publicDir: resolve(__dirname, 'public/static')
})
