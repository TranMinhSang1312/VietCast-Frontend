// Runtime API configuration.

import axios from 'axios';
import { handleApiError, ApiError } from './utils/apiError';
//
// How the renderer learns where the backend lives:
//
//   1. In a plain web browser (no Electron): Vite inlines env vars
//      prefixed with VITE_ from `process.env` at build time.
//
//        VITE_API_BASE_URL=https://api.vietcast.com npm run build:react
//
//   2. Inside Electron, the JS bundle asks the main process through
//      the preload bridge for the authoritative config (env vars on
//      the host machine / packaged installer). That value overrides
//      the build-time Vite constant.
//
// Resolution priority (highest first):
//   1. window.electronAPI.getRuntimeConfig() (Electron main process)
//   2. import.meta.env.VITE_API_BASE_URL  (build-time constant)
//   3. HARDCODED production fallback (https://vietcast-backend.onrender.com)
//
// We do NOT fall back to localhost:8080 anymore — production builds must
// never accidentally dial the dev backend. Local dev overrides come from
// .env.development (loaded by Vite) or VIETCAST_API_BASE_URL on the host.

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

  // 1) Electron runtime config (authoritative in desktop builds).
  if (typeof window !== 'undefined' && window.electronAPI?.getRuntimeConfig) {
    try {
      const cfg = await window.electronAPI.getRuntimeConfig();
      if (cfg && (cfg.apiBaseUrl || cfg.wsBaseUrl)) {
        runtimeCache = {
          apiBaseUrl: cfg.apiBaseUrl || PROD_API_BASE_URL,
          wsBaseUrl:  cfg.wsBaseUrl  || PROD_WS_BASE_URL,
          env:        cfg.env        || (import.meta.env?.MODE) || 'production',
          platform:   cfg.platform   || (typeof navigator !== 'undefined' ? navigator.platform : 'web'),
          appVersion: cfg.appVersion || readViteEnv('VITE_APP_VERSION', ''),
          source:     'electron',
        };
        return runtimeCache;
      }
    } catch {
      /* fall through to Vite constants */
    }
  }

  // 2) Vite-inlined env constants.
  // 3) Hardcoded production fallback (NEVER localhost).
  runtimeCache = {
    apiBaseUrl: readViteEnv('VITE_API_BASE_URL', PROD_API_BASE_URL),
    wsBaseUrl:  readViteEnv('VITE_WS_BASE_URL',  PROD_WS_BASE_URL),
    env:        readViteEnv('MODE', 'production'),
    platform:   typeof navigator !== 'undefined' ? navigator.platform : 'web',
    appVersion: readViteEnv('VITE_APP_VERSION', ''),
    source:     'vite-or-fallback',
  };
  return runtimeCache;
}

// ---------------------------------------------------------------------------
// Axios response interceptor
//
// Centralises error translation so every catch block can rely on a
// normalised shape instead of poking at err.response.data by hand.
// Components can still call `handleApiError(err)` directly when they
// need status/code, but the typical flow is now:
//
//   try { await axios.post(...) }
//   catch (err) { setError(err.message) }   // err is already an ApiError
//
// We deliberately reject with an `ApiError` (which extends Error) so
// legacy `err.message` accessors keep working.
// ---------------------------------------------------------------------------
axios.interceptors.response.use(
  (response) => response,
  (err) => {
    const processed = handleApiError(err);
    return Promise.reject(new ApiError(processed));
  }
);

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

export const IS_ELECTRON =
  typeof window !== 'undefined' && !!window.electronAPI;

// Diagnostic line — shows up in DevTools console so build issues are obvious.
if (typeof window !== 'undefined' && window.console) {
  loadRuntimeConfig().then((cfg) => {
    // eslint-disable-next-line no-console
    console.info('[vietcast] runtime config:', cfg);
  });
}