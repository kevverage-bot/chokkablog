import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { handleTokenHandoff } from './lib/handleTokenHandoff.ts'

// The site is public — no auth gate. Sign-in (for admin) is reachable at /login.
// Any SSO token in the URL hash is resolved BEFORE the first render, so an
// already-authenticated admin lands signed in rather than seeing the signed-out
// nav for a frame. `finally`, not `then`: a failed handoff must not stop the
// site from rendering for everyone else.
handleTokenHandoff().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
