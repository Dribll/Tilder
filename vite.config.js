import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  clearScreen: false,
  base: './',
  plugins: [react()],
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: 'all',
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/*.py', '**/*.rs', '**/*.java', '**/*.class', '**/*.exe', '**/*.dll', '**/target/**', '**/.git/**'],
    },
    proxy: {
      '/api': 'http://localhost:3210',
      '/socket.io': 'http://localhost:3210',
    },
  },
  optimizeDeps: {
    include: [
      '@monaco-editor/react',
      'react',
      'react-dom',
      '@xterm/xterm',
      '@xterm/addon-fit',
      'socket.io-client',
    ],
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-monaco': ['@monaco-editor/react'],
          'vendor-editors': ['@tinymce/tinymce-react', 'tinymce', 'handsontable'],
          'vendor-icons': [
            '@fortawesome/react-fontawesome',
            '@fortawesome/free-solid-svg-icons',
            '@fortawesome/free-regular-svg-icons',
            '@fortawesome/free-brands-svg-icons',
            'react-icons'
          ],
          'vendor-term': ['@xterm/xterm', '@xterm/addon-fit']
        }
      }
    }
  },
})
