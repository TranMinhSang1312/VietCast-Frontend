import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';

// ---------------------------------------------------------------------------
// GoogleOAuthProvider — must wrap everything that uses the official
// `@react-oauth/google` components (`<GoogleLogin />`, `useGoogleLogin`,
// `<GoogleOneTap />`).
//
// We read the client ID from Vite's build-time constants so the same
// bundle works in dev (Vite picks up `.env.development`) and prod (Vite
// picks up `.env.production` / baked-in constants).
//
// When the env is missing we deliberately pass a non-empty placeholder
// instead of skipping the provider — otherwise `<GoogleLogin />` would
// throw at mount with a confusing error. The Login page itself shows a
// disabled placeholder button when VITE_GOOGLE_CLIENT_ID is unset, so
// the user is not lied to.
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || 'unconfigured-google-client-id';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/*
      Provider order matters:
      1. GoogleOAuthProvider  — provides the OAuth context for hooks/buttons
      2. AuthProvider         — provides the AuthContext; useAuth() must
                                work inside both the router tree and the
                                standalone VersionCheckModal, so we keep
                                AuthProvider OUTSIDE the router.
      3. App                  — the router.
    */}
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>
);
