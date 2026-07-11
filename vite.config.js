import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Pick up .env, .env.local, .env.production, .env.development, .env.{mode}
  // regardless of CWD so we behave like a normal Vite app.
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      // Expose VITE_ env vars to the renderer explicitly (loadEnv does
      // this for us via import.meta.env, but we also expose them here
      // for any window.__VIETCAST_RUNTIME__-style bootstrap code).
      __VITE_API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || ''),
      __VITE_WS_BASE_URL__: JSON.stringify(env.VITE_WS_BASE_URL || ''),
      __VITE_APP_VERSION__: JSON.stringify(env.VITE_APP_VERSION || '1.0.0'),
      __VITE_ENV__: JSON.stringify(mode),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      // Ensure HTML produced for electron-builder points at relative
      // asset paths so loadFile() in production works correctly.
      base: './',
      // recharts is ~120 KB gzipped; bundle stays comfortably under
      // 1 MB so we raise the warning threshold rather than splitting
      // (splitting forces a Promise barrier on first paint, which
      // hurts the Electron splash UX).
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Stable chunk names so cache invalidation is predictable.
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 3000,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }
})