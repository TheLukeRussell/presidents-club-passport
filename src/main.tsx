// Entry point. HashRouter keeps routes after the # so GitHub Pages never
// needs a 404 workaround, and Back and shared links just work. AuthProvider
// is a no-op in the demo; in the live passport it knows who's signed in.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './styles/app.css'
import { App } from './App'
import { AppProvider } from './state/AppState'
import { AuthProvider } from './state/Auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
