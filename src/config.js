// Runtime API configuration for the pure-Web build.
//
// The renderer learns where the backend lives through ONE chain:
//   1. import.meta.env.VITE_API_BASE_URL  (build-time constant)
//   2. PROD_API_BASE_URL                   (hardcoded production fallback)
//
// Earlier Electron-specific runtime config (window.electronAPI.getRuntimeConfig())
// has been removed — this project is now a plain SPA that talks to the
// Spring Boot backend over HTTPS.
//
// We deliberately do NOT fall back to localhost:8080 in production —
// that would mask deployment bugs by silently hitting a dev backend.
//
// Imports `utils/axiosInterceptor` for its side-effect of attaching
// the request/response interceptors to the shared axios instance
// (Bearer-token injection + error normalisation).

// The Render default URL is `https://<service-name>-<hash>.onrender.com`,
// which is a moving target per region / per deploy. We keep a placeholder
// so the dev server boots without any .env file, but production deploys
// MUST set `VITE_API_BASE_URL` at build time on Render/Vercel — otherwise
// every API call will 404 against the wrong host.
//
// To find your current production URL after a Render deploy:
//   - Dashboard → vietcast-backend → top right shows "Onrender URL"
//   - or run: `render services list --output json | jq -r '.[].url'`
export const PROD_API_BASE_URL = 'https://vietcast-backend.onrender.com';
export const PROD_WS_BASE_URL  = 'wss://vietcast-backend.onrender.com';

/** Build-time constant OR hardcoded fallback if no env was inlined. */
function readViteEnv(key, fallback) {
  try {
    const v = import.meta.env?.[key];
    if (typeof v === 'string' && v.length > 0) return v;
  } catch { /* not in Vite */ }
  return fallback;
}

let runtimeCache = null;

async function loadRuntimeConfig() {
  if (runtimeCache) return runtimeCache;

  // Vite-inlined env constants OR hardcoded production fallback.
  runtimeCache = {
    apiBaseUrl: readViteEnv('VITE_API_BASE_URL', PROD_API_BASE_URL),
    wsBaseUrl:  readViteEnv('VITE_WS_BASE_URL',  PROD_WS_BASE_URL),
    env:        readViteEnv('MODE', 'production'),
    platform:   typeof navigator !== 'undefined' ? navigator.platform : 'web',
    source:     'vite-or-fallback',
  };
  return runtimeCache;
}

// ---------------------------------------------------------------------------
// Axios interceptor setup
//
// The actual interceptor wiring lives in `utils/axiosInterceptor.js` so
// every consumer (config, services, components) only needs to import it
// once. Re-importing the file is a no-op because of the
// `INTERCEPTORS_REGISTERED` flag — Vite's module system already caches
// imports, but we keep the flag for absolute certainty (and to avoid
// double-attaching the same interceptor on hot reload).
// ---------------------------------------------------------------------------
import "./utils/axiosInterceptor";

export const API_BASE_URL_PROVIDER = {
  /** Async — must be awaited at app boot before any axios call. */
  load: loadRuntimeConfig,

  /**
   * Synchronous fallback for code paths that can't await —
   * prefers the Vite-inlined constant, then the production fallback.
   */
  get sync() {
    return readViteEnv('VITE_API_BASE_URL', PROD_API_BASE_URL);
  },
};

export const WS_BASE_URL_PROVIDER = {
  load: loadRuntimeConfig,
  get sync() {
    return readViteEnv('VITE_WS_BASE_URL', PROD_WS_BASE_URL);
  },
};

// Diagnostic line — shows up in DevTools console so build issues are obvious.
if (typeof window !== 'undefined' && window.console) {
  loadRuntimeConfig().then((cfg) => {
    // eslint-disable-next-line no-console
    console.info('[vietcast] runtime config:', cfg);
  });
}