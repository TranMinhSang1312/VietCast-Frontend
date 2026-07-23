import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe __dirname equivalent — required because this file is now
// loaded as an ES module (the package.json declares `"type": "module"`).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Pick up .env, .env.local, .env.production, .env.development, .env.{mode}
  // regardless of CWD so we behave like a normal Vite app.
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    // base: '/' — Vite default. Lets the dev server and any web
    // deployment (Vercel, Netlify, nginx) serve clean URLs like
    // /dashboard instead of /./dashboard. The previous "./" base was
    // only needed for electron-builder's loadFile() context.
    base: '/',
    plugins: [react(), tailwindcss()],
    define: {
      // Expose VITE_ env vars to the renderer explicitly (loadEnv does
      // this for us via import.meta.env, but we also expose them here
      // for any window.__VIETCAST_RUNTIME__-style bootstrap code).
      __VITE_API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL || ''),
      __VITE_WS_BASE_URL__: JSON.stringify(env.VITE_WS_BASE_URL || ''),
      __VITE_ENV__: JSON.stringify(mode),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Stable chunk names so cache invalidation is predictable.
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          // ────────────────────────────────────────────────────────────────
          // Manual vendor chunking.
          //
          // The default Rollup behaviour puts every dep into a single
          // `index-[hash].js` (or splits node_modules lazily by size).
          // Both behaviours are wrong for our cache profile:
          //
          //   - React/react-dom/react-router are stable across deploys
          //     (we don't bump them every PR), so they should sit in
          //     a long-lived chunk that browsers can reuse across
          //     releases.
          //   - recharts (~150 kB) is ONLY pulled by VideoHistory's
          //     charts (when present). Splitting it out keeps the
          //     dashboard initial bundle under the 200 kB budget.
          //   - axios has its own surface (interceptors, request
          //     shaping) and is unlikely to change with every release.
          //
          // The `id` predicate pattern is documented at
          // https://rollupjs.org/configuration-options/#output-manualchunks
          // — `id` is the absolute path of each imported module, so we
          // match by package name prefix.
          // ────────────────────────────────────────────────────────────────
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // React core — never split: react, react-dom, scheduler.
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            // React Router bundles its own context that depends on
            // react-router-dom; keep them together.
            if (id.includes('/react-router/') || id.includes('/react-router-dom/')) {
              return 'vendor-router';
            }
            // Charts — only loaded when a page imports recharts.
            if (id.includes('/recharts/') || id.includes('/d3-')) {
              return 'vendor-charts';
            }
            // HTTP + JSON.
            if (id.includes('/axios/') || id.includes('/follow-redirects/')) {
              return 'vendor-http';
            }
            // Icons — lucide-react is a single large module with many
            // tree-shakeable exports; Vite handles the per-export split
            // but we still want a stable chunk name.
            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
            // Google OAuth + Tailwind runtime.
            if (id.includes('/@react-oauth/google/')) {
              return 'vendor-oauth';
            }
            // Fallback: every other node_modules dep into one shared chunk.
            return 'vendor';
          },
        },
      },
    },
    server: {
      // Default web dev port. BrowserRouter requires the dev server
      // to fall back to index.html for unknown paths, which Vite does
      // out of the box thanks to its built-in historyApiFallback.
      port: 3000,
      strictPort: true,
      host: true, // expose to LAN so other devices on the network can hit it
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});