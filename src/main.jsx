import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/*
      AuthProvider must wrap App so useAuth() works inside both the
      router tree and the standalone VersionCheckModal. We deliberately
      put AuthProvider OUTSIDE the router so non-router code
      (e.g. the version check) can read the auth state via the hook.
    */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)