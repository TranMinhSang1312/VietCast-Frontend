// Runtime API configuration for the pure-Web build.
//
// Production always uses the stable VietCast API domain. Development may
// override it with VITE_API_BASE_URL / VITE_WS_BASE_URL.
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

// Stable production endpoint backed by the Oracle deployment.
export const PROD_API_BASE_URL = 'https://api.vietcast.id.vn';
export const PROD_WS_BASE_URL  = 'wss://api.vietcast.id.vn';

const RESOLVED_API_BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || PROD_API_BASE_URL)
  : PROD_API_BASE_URL;

const RESOLVED_WS_BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_WS_BASE_URL || PROD_WS_BASE_URL)
  : PROD_WS_BASE_URL;

let runtimeCache = null;

async function loadRuntimeConfig() {
  if (runtimeCache) return runtimeCache;

  runtimeCache = {
    apiBaseUrl: RESOLVED_API_BASE_URL,
    wsBaseUrl:  RESOLVED_WS_BASE_URL,
    env:        import.meta.env.MODE || 'production',
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

  /** Synchronous value for code paths that cannot await runtime setup. */
  get sync() {
    return RESOLVED_API_BASE_URL;
  },
};

export const WS_BASE_URL_PROVIDER = {
  load: loadRuntimeConfig,
  get sync() {
    return RESOLVED_WS_BASE_URL;
  },
};

// Diagnostic line — shows up in DevTools console so build issues are obvious.
if (typeof window !== 'undefined' && window.console) {
  loadRuntimeConfig().then((cfg) => {
    console.info('[vietcast] runtime config:', cfg);
  });
}
